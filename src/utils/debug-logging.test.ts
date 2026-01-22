import { describe, expect, it, vi } from 'vitest';
import {
  createDebugLogger,
  formatDebugMessage,
  isDebugLoggingEnabled,
  safeStringify,
} from './debug-logging.js';

describe('debug-logging utilities', () => {
  it('formats debug messages with context', () => {
    const message = formatDebugMessage('connected', { sessionId: 'abc123' });

    expect(message).toBe('[debug] connected {"sessionId":"abc123"}');
  });

  it('handles unserializable values safely', () => {
    const circular: { value: number; self?: unknown } = { value: 1 };
    circular.self = circular;

    expect(safeStringify(circular)).toBe('[unserializable]');
  });

  it('suppresses debug logging when disabled', () => {
    const sink = vi.fn();
    const logger = createDebugLogger(isDebugLoggingEnabled('0'), sink);

    logger('should not log');

    expect(sink).not.toHaveBeenCalled();
  });
});