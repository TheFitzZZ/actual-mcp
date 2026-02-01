/**
 * Get date range parameters with defaults
 */
export function getDateRange(startDate?: string, endDate?: string): { startDate: string; endDate: string } {
  const today = new Date();
  const defaultStartDateOverride = process.env.ACTUAL_DEFAULT_START_DATE;
  const defaultMonthsRaw = process.env.ACTUAL_DEFAULT_DATE_RANGE_MONTHS;
  const defaultMonths = defaultMonthsRaw ? Number(defaultMonthsRaw) : 3;
  const monthsToUse = Number.isFinite(defaultMonths) && defaultMonths > 0 ? defaultMonths : 3;
  const defaultStartDate = new Date();
  defaultStartDate.setMonth(today.getMonth() - monthsToUse); // default months ago

  return {
    startDate: startDate || defaultStartDateOverride || formatDate(defaultStartDate),
    endDate: endDate || formatDate(today),
  };
}

/**
 * Format a date as YYYY-MM-DD
 */
export function formatDate(date: Date | string | undefined | null): string {
  if (!date) return '';
  if (typeof date === 'string') return date;

  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

/**
 * Format currency amounts for display
 */
export function formatAmount(amount: number | undefined | null): string {
  if (amount === undefined || amount === null) return 'N/A';

  // Convert from cents to dollars
  const dollars = amount / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
}

// Helper to calculate start/end date strings for the N most recent months
export function getDateRangeForMonths(months: number): {
  start: string;
  end: string;
} {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of current month
  const start = new Date(end.getFullYear(), end.getMonth() - months + 1, 1); // first day of N months ago
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}
