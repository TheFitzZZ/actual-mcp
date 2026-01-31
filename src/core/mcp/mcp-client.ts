import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface McpClientOptions {
  baseUrl: string;
  bearerToken?: string;
}

export interface McpInitializeOptions {
  protocolVersion?: string;
  clientName?: string;
  clientVersion?: string;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: T;
  error?: JsonRpcError;
}

interface InitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo?: Record<string, unknown>;
}

const DEFAULT_PROTOCOL_VERSION = '2024-11-05';

const buildHeaders = (bearerToken?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  return headers;
};

export class McpClient {
  private readonly baseUrl: string;
  private readonly bearerToken?: string;
  private sessionId: string | null = null;

  constructor(options: McpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.bearerToken = options.bearerToken;
  }

  async initialize(options: McpInitializeOptions = {}): Promise<InitializeResult> {
    const payload = {
      jsonrpc: '2.0',
      id: this.buildRequestId(),
      method: 'initialize',
      params: {
        protocolVersion: options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
        clientInfo: {
          name: options.clientName ?? 'actual-mcp-test',
          version: options.clientVersion ?? '0.1.0',
        },
        capabilities: {},
      },
    };

    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: buildHeaders(this.bearerToken),
      body: JSON.stringify(payload),
    });

    const sessionId = response.headers.get('mcp-session-id');
    if (!sessionId) {
      throw new Error('Missing MCP session id in response headers');
    }

    const body = (await this.parseJsonRpcResponse<InitializeResult>(response)) as JsonRpcResponse<InitializeResult>;
    if (body.error) {
      throw new Error(body.error.message);
    }

    if (!body.result) {
      throw new Error('Missing initialize result');
    }

    this.sessionId = sessionId;
    return body.result;
  }

  async callTool<TArgs extends Record<string, unknown>>(
    name: string,
    args: TArgs
  ): Promise<CallToolResult> {
    const sessionId = this.sessionId;
    if (!sessionId) {
      throw new Error('MCP client not initialized. Call initialize() first.');
    }

    const payload = {
      jsonrpc: '2.0',
      id: this.buildRequestId(),
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    };

    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        ...buildHeaders(this.bearerToken),
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify(payload),
    });

    const body = (await this.parseJsonRpcResponse<CallToolResult>(response)) as JsonRpcResponse<CallToolResult>;
    if (body.error) {
      throw new Error(body.error.message);
    }

    if (!body.result) {
      throw new Error('Missing tool result');
    }

    return body.result;
  }

  private buildRequestId(): number {
    return Math.floor(Math.random() * 1_000_000);
  }

  private async parseJsonRpcResponse<T>(response: Response): Promise<JsonRpcResponse<T>> {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('text/event-stream')) {
      if (!response.body) {
        const text = await response.text();
        const dataLine = text
          .split('\n')
          .map((line) => line.trim())
          .find((line) => line.startsWith('data: '));

        if (!dataLine) {
          throw new Error('Missing SSE data payload in MCP response');
        }

        return JSON.parse(dataLine.replace('data: ', '')) as JsonRpcResponse<T>;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) {
            continue;
          }

          const payload = trimmed.replace('data: ', '');
          try {
            const parsed = JSON.parse(payload) as JsonRpcResponse<T>;
            await reader.cancel();
            return parsed;
          } catch {
            buffer = `${payload}\n${buffer}`;
          }
        }

        const inlineIndex = buffer.indexOf('data: ');
        if (inlineIndex !== -1) {
          const inlinePayload = buffer.slice(inlineIndex + 'data: '.length).trim();
          try {
            const parsed = JSON.parse(inlinePayload) as JsonRpcResponse<T>;
            await reader.cancel();
            return parsed;
          } catch {
            // Wait for more data
          }
        }
      }

      throw new Error('Missing SSE data payload in MCP response');
    }

    return (await response.json()) as JsonRpcResponse<T>;
  }
}
