import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDateRange } from './utils.js';

const originalEnv = { ...process.env };

describe('getDateRange', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it('uses the configured default month range', () => {
    process.env.ACTUAL_DEFAULT_DATE_RANGE_MONTHS = '6';

    const range = getDateRange();

    expect(range.startDate).toBe('2025-08-01');
    expect(range.endDate).toBe('2026-02-01');
  });

  it('prefers the explicit default start date override', () => {
    process.env.ACTUAL_DEFAULT_START_DATE = '2020-01-01';

    const range = getDateRange();

    expect(range.startDate).toBe('2020-01-01');
    expect(range.endDate).toBe('2026-02-01');
  });

  it('falls back to three months when the month override is invalid', () => {
    process.env.ACTUAL_DEFAULT_DATE_RANGE_MONTHS = '-2';

    const range = getDateRange();

    expect(range.startDate).toBe('2025-11-01');
    expect(range.endDate).toBe('2026-02-01');
  });
});
