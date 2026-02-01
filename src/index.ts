#!/usr/bin/env node
/**
 * MCP Server for Actual Budget
 *
 * This server exposes your Actual Budget data to LLMs through the Model Context Protocol,
 * allowing for natural language interaction with your financial data.
 *
 * Features:
 * - List and view accounts
 * - View transactions with filtering
 * - Generate financial statistics and analysis
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { initActualApi, shutdownActualApi } from './actual-api.js';
import { fetchAllAccounts } from './core/data/fetch-accounts.js';
import { setupPrompts } from './prompts.js';
import { setupResources } from './resources.js';
import { setupTools } from './tools/index.js';
import { createDebugLogger, isDebugLoggingEnabled, toErrorMessage } from './utils/debug-logging.js';
import { SetLevelRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

dotenv.config({ path: '.env' });

// Initialize the MCP server
const server = new Server(
  {
    name: 'Actual Budget',
    version: '1.0.0',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
      logging: {},
    },
  }
);

// Argument parsing
const {
  values: {
    sse: useSse,
    'enable-write': enableWrite,
    'enable-bearer': enableBearer,
    port,
    'test-resources': testResources,
    'test-custom': testCustom,
  },
} = parseArgs({
  options: {
    sse: { type: 'boolean', default: false },
    'enable-write': { type: 'boolean', default: false },
    'enable-bearer': { type: 'boolean', default: false },
    port: { type: 'string' },
    'test-resources': { type: 'boolean', default: false },
    'test-custom': { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

const resolvedPort = port ? parseInt(port, 10) : 3000;

// Bearer authentication middleware
const bearerAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!enableBearer) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      error: 'Authorization header required',
    });
    return;
  }

  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: "Authorization header must start with 'Bearer '",
    });
    return;
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix
  const expectedToken = process.env.BEARER_TOKEN;

  if (!expectedToken) {
    console.error('BEARER_TOKEN environment variable not set');
    res.status(500).json({
      error: 'Server configuration error',
    });
    return;
  }

  if (token !== expectedToken) {
    res.status(401).json({
      error: 'Invalid bearer token',
    });
    return;
  }

  next();
};

const debugEnabled = isDebugLoggingEnabled(process.env.MCP_DEBUG_LOGGING);
const logDebug = createDebugLogger(debugEnabled, (message) => console.error(message));

const safeSendLoggingMessage = (level: 'info' | 'error', message: string): void => {
  const fallback = () => {
    // # Reason: avoid crashing when logging occurs before transport connection is ready.
    if (level === 'error') {
      process.stderr.write(`${message}\n`);
    } else {
      process.stdout.write(`${message}\n`);
    }
  };

  try {
    const result = server.sendLoggingMessage({ level, message });
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch(() => fallback());
    }
  } catch {
    fallback();
  }
};

const attachSafeConsoleLogging = (): void => {
  console.log = (message: string) => safeSendLoggingMessage('info', message);
  console.error = (message: string) => safeSendLoggingMessage('error', message);
};

const getHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  return Array.isArray(value) ? value[0] : value;
};

const getRemoteAddress = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? 'unknown';

const buildConnectionContext = (req: Request): Record<string, unknown> => ({
  remoteAddress: getRemoteAddress(req),
  forwardedFor: getHeaderValue(req.headers['x-forwarded-for']),
  forwardedProto: getHeaderValue(req.headers['x-forwarded-proto']),
  userAgent: getHeaderValue(req.headers['user-agent']),
  accept: req.headers.accept,
});

const attachRequestDebugHandlers = (label: string, req: Request, res: Response): void => {
  if (!debugEnabled) {
    return;
  }

  const startedAt = Date.now();
  logDebug(`${label} opened`, buildConnectionContext(req));

  req.on('aborted', () =>
    logDebug(`${label} aborted`, {
      elapsedMs: Date.now() - startedAt,
    })
  );
  req.on('close', () =>
    logDebug(`${label} request closed`, {
      elapsedMs: Date.now() - startedAt,
    })
  );
  req.socket.once('timeout', () =>
    logDebug(`${label} socket timeout`, {
      elapsedMs: Date.now() - startedAt,
    })
  );
  res.on('close', () =>
    logDebug(`${label} response closed`, {
      elapsedMs: Date.now() - startedAt,
      statusCode: res.statusCode,
    })
  );
  res.on('finish', () =>
    logDebug(`${label} response finished`, {
      elapsedMs: Date.now() - startedAt,
      statusCode: res.statusCode,
    })
  );
  res.on('error', (error) =>
    logDebug(`${label} response error`, {
      elapsedMs: Date.now() - startedAt,
      error: toErrorMessage(error),
    })
  );
};

// ----------------------------
// SERVER STARTUP
// ----------------------------

// Start the server
async function main(): Promise<void> {
  // If testing resources, verify connectivity and list accounts, then exit
  if (testResources) {
    console.log('Testing resources...');
    try {
      await initActualApi();
      const accounts = await fetchAllAccounts();
      console.log(`Found ${accounts.length} account(s).`);
      accounts.forEach((account) => console.log(`- ${account.id}: ${account.name}`));
      console.log('Resource test passed.');
      await shutdownActualApi();
      process.exit(0);
    } catch (error) {
      console.error('Resource test failed:', error);
      process.exit(1);
    }
  }

  if (testCustom) {
    console.log('Initializing custom test...');
    try {
      await initActualApi();

      // Custom test here

      // ----------------

      console.log('Custom test passed.');
      await shutdownActualApi();
      process.exit(0);
    } catch (error) {
      console.error('Custom test failed:', error);
    }
  }

  // Validate environment variables
  if (!process.env.ACTUAL_DATA_DIR && !process.env.ACTUAL_SERVER_URL) {
    console.error('Warning: Neither ACTUAL_DATA_DIR nor ACTUAL_SERVER_URL is set.');
  }

  if (process.env.ACTUAL_SERVER_URL && !process.env.ACTUAL_PASSWORD) {
    console.error('Warning: ACTUAL_SERVER_URL is set but ACTUAL_PASSWORD is not.');
    console.error('If your server requires authentication, initialization will fail.');
  }

  logDebug('Server configuration', {
    transport: useSse ? 'sse' : 'stdio',
    enableWrite,
    enableBearer,
    port: resolvedPort,
  });

  if (useSse) {
    const app = express();
    app.use(express.json());
    let transport: SSEServerTransport | null = null;

    // Log bearer auth status
    if (enableBearer) {
      console.error('Bearer authentication enabled for SSE endpoints');
    } else {
      console.error('Bearer authentication disabled - endpoints are public');
    }

    const streamableHttpTransports = new Map<string, StreamableHTTPServerTransport>();

    const parseSessionHeader = (value: string | string[] | undefined): string | undefined => {
      if (!value) {
        return undefined;
      }
      return Array.isArray(value) ? value[0] : value;
    };

    app.get(['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/sse'], (_req, res) => {
      res.status(404).json({ error: 'OAuth metadata not configured for this server' });
    });
    app.get(['/sse/.well-known/oauth-authorization-server'], (_req, res) => {
      res.status(404).json({ error: 'OAuth metadata not configured for this server' });
    });

    const handleLegacySse = (req: Request, res: Response): void => {
      attachRequestDebugHandlers('SSE /sse', req, res);
      logDebug('Initializing SSE transport', {
        ...buildConnectionContext(req),
      });

      req.socket.setTimeout(0);
      req.socket.setKeepAlive(true, 30000);
      res.setTimeout(0);
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      transport = new SSEServerTransport('/messages', res);
      server
        .connect(transport)
        .then(() => {
          attachSafeConsoleLogging();

          console.error(`Actual Budget MCP Server (SSE) started on port ${resolvedPort}`);
          logDebug('SSE transport connected', { remoteAddress: getRemoteAddress(req) });
        })
        .catch((error) => {
          console.error(`Failed to connect SSE transport: ${toErrorMessage(error)}`);
        });
    };

    app.get('/sse', bearerAuth, handleLegacySse);

    const streamablePaths = ['/', '/mcp'];

    app.all(streamablePaths, bearerAuth, async (req: Request, res: Response) => {
      const sessionHeader = parseSessionHeader(req.headers['mcp-session-id']);
      const requestLabel = `${req.method} ${req.path}`;
      attachRequestDebugHandlers(`Streamable HTTP ${requestLabel}`, req, res);
      logDebug('Streamable HTTP request received', {
        requestLabel,
        sessionHeader,
        hasBody: Boolean(req.body),
        acceptsSse: req.headers.accept?.includes('text/event-stream'),
        ...buildConnectionContext(req),
      });
      if (req.method === 'GET' && !sessionHeader && req.headers.accept?.includes('text/event-stream')) {
        handleLegacySse(req, res);
        return;
      }
      try {
        let streamableTransport = sessionHeader ? streamableHttpTransports.get(sessionHeader) : undefined;

        if (!streamableTransport) {
          if (req.method === 'POST' && isInitializeRequest(req.body)) {
            const remoteAddress = req.ip ?? req.socket.remoteAddress ?? 'unknown';
            streamableTransport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (sessionId) => {
                streamableHttpTransports.set(sessionId, streamableTransport!);
                console.info(`Streamable HTTP session initialized (session ${sessionId}) from ${remoteAddress}`);
                logDebug('Streamable HTTP session initialized', {
                  sessionId,
                  remoteAddress,
                });
              },
              onsessionclosed: (sessionId) => {
                streamableHttpTransports.delete(sessionId);
                console.info(`Streamable HTTP session closed (session ${sessionId})`);
                logDebug('Streamable HTTP session closed', { sessionId });
              },
            });

            streamableTransport.onclose = () => {
              const activeSessionId = streamableTransport?.sessionId;
              if (activeSessionId) {
                streamableHttpTransports.delete(activeSessionId);
                console.info(`Streamable HTTP transport closed (session ${activeSessionId})`);
                logDebug('Streamable HTTP transport closed', { sessionId: activeSessionId });
              }
            };

            try {
              await server.connect(streamableTransport);

              attachSafeConsoleLogging();

              console.error(`Actual Budget MCP Server (Streamable HTTP) started on port ${resolvedPort}`);
            } catch (error) {
              console.error(`Failed to connect streamable HTTP transport: ${toErrorMessage(error)}`);
              res.status(500).json({
                jsonrpc: '2.0',
                error: {
                  code: -32603,
                  message: 'Internal server error',
                },
                id: null,
              });
              return;
            }
          } else {
            res.status(400).json({
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message: 'Bad Request: No valid session ID provided',
              },
              id: null,
            });
            return;
          }
        }

        if (!streamableTransport) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
          return;
        }

        await streamableTransport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error(`Streamable HTTP handler error for ${requestLabel}: ${toErrorMessage(error)}`);

        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    });

    app.post('/messages', bearerAuth, async (req: Request, res: Response) => {
      attachRequestDebugHandlers('SSE /messages', req, res);
      logDebug('SSE message received', {
        hasTransport: Boolean(transport),
        hasBody: Boolean(req.body),
        ...buildConnectionContext(req),
      });
      if (transport) {
        try {
          await transport.handlePostMessage(req, res, req.body);
        } catch (error) {
          console.error(`SSE message handler error: ${toErrorMessage(error)}`);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
          }
        }
      } else {
        res.status(500).json({ error: 'Transport not initialized' });
      }
    });

    app.listen(resolvedPort, (error) => {
      if (error) {
        console.error('Error:', error);
      } else {
        console.error(`Actual Budget MCP Server (SSE) started on port ${resolvedPort}`);
      }
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Actual Budget MCP Server (stdio) started');
  }
}

setupResources(server);
setupTools(server, enableWrite);
setupPrompts(server);

server.setRequestHandler(SetLevelRequestSchema, (request) => {
  console.log(`--- Logging level: ${request.params.level}`);
  return {};
});

process.on('SIGINT', () => {
  console.error('SIGINT received, shutting down server');
  server.close();
  process.exit(0);
});

main()
  .then(() => {
    if (!useSse) {
      // TODO: Setup proper logging level change. Messages are available in the notification of MCP Inspector
      attachSafeConsoleLogging();
    }
  })
  .catch((error: unknown) => {
    console.error(`Server error: ${toErrorMessage(error)}`);
    process.exit(1);
  });
