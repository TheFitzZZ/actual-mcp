import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpClient } from './mcp-client.js';

const createMockResponse = <T>(options: {
  json: T;
  headers?: Record<string, string>;
}) => ({
  headers: {
    get: (key: string) => options.headers?.[key.toLowerCase()] ?? null,
  },
  json: async () => options.json,
});

describe('McpClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initializes and stores the session id', async () => {
    fetchMock.mockResolvedValue(
      createMockResponse({
        json: {
          jsonrpc: '2.0',
          id: 1,
          result: { protocolVersion: '2024-11-05', capabilities: {} },
        },
        headers: {
          'mcp-session-id': 'session-123',
        },
      })
    );

    const client = new McpClient({ baseUrl: 'http://localhost:3000' });
    const result = await client.initialize();

    expect(result.protocolVersion).toBe('2024-11-05');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when initialization response lacks session id', async () => {
    fetchMock.mockResolvedValue(
      createMockResponse({
        json: {
          jsonrpc: '2.0',
          id: 1,
          result: { protocolVersion: '2024-11-05', capabilities: {} },
        },
      })
    );

    const client = new McpClient({ baseUrl: 'http://localhost:3000' });

    await expect(client.initialize()).rejects.toThrow('Missing MCP session id');
  });

  it('throws when tool call returns an error', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createMockResponse({
          json: {
            jsonrpc: '2.0',
            id: 1,
            result: { protocolVersion: '2024-11-05', capabilities: {} },
          },
          headers: {
            'mcp-session-id': 'session-456',
          },
        })
      )
      .mockResolvedValueOnce(
        createMockResponse({
          json: {
            jsonrpc: '2.0',
            id: 2,
            error: { code: -32000, message: 'Tool failed' },
          },
        })
      );

    const client = new McpClient({ baseUrl: 'http://localhost:3000' });
    await client.initialize();

    await expect(client.callTool('create-transaction', { account: 'id' })).rejects.toThrow('Tool failed');
  });
});
