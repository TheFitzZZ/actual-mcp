export interface DebugLogContext {
  [key: string]: unknown;
}

/**
 * Determine if debug logging is enabled via environment variable.
 */
export const isDebugLoggingEnabled = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

/**
 * Safely stringify values for logging without throwing on circular structures.
 */
export const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
};

/**
 * Convert unknown errors to a readable string for logs.
 */
export const toErrorMessage = (value: unknown): string =>
  value instanceof Error ? `${value.name}: ${value.message}` : safeStringify(value);

/**
 * Format a debug message with optional structured context.
 */
export const formatDebugMessage = (message: string, context?: DebugLogContext): string => {
  const suffix = context ? ` ${safeStringify(context)}` : '';
  return `[debug] ${message}${suffix}`;
};

/**
 * Create a debug logger with a provided sink.
 */
export const createDebugLogger = (
  enabled: boolean,
  log: (message: string) => void
): ((message: string, context?: DebugLogContext) => void) =>
  (message: string, context?: DebugLogContext): void => {
    if (!enabled) {
      return;
    }

    log(formatDebugMessage(message, context));
  };