import { describe, it, expect } from 'vitest';
import dotenv from 'dotenv';
import { McpClient } from './mcp-client.js';

dotenv.config({ path: '.env.test' });

const getTextContent = (result: { content: Array<{ type: string; text?: string }> }): string => {
  const textItem = result.content.find((item) => item.type === 'text');
  return textItem?.text ?? '';
};

const assertToolSuccess = (result: { isError?: boolean; content: Array<{ type: string; text?: string }> }) => {
  if (result.isError) {
    throw new Error(getTextContent(result));
  }
};

const withTimeout = async <T>(promise: Promise<T>, label: string, timeoutMs: number): Promise<T> => {
  let timeoutId: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timed out: ${label}`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const baseUrl = process.env.MCP_BASE_URL;
const bearerToken = process.env.MCP_BEARER_TOKEN;
const integration = baseUrl ? describe : describe.skip;

integration('MCP read-only tools', () => {
  it('executes all read-only tools without errors', async () => {
    const client = new McpClient({ baseUrl: baseUrl as string, bearerToken });
    await client.initialize();

    const accountsResult = await withTimeout(client.callTool('get-accounts', {}), 'get-accounts', 15000);
    assertToolSuccess(accountsResult);
    const accounts = JSON.parse(getTextContent(accountsResult)) as Array<{ id: string; name: string }>;
    const tempAccount = accounts.find((account) => account.name === 'Temp');

    expect(tempAccount, 'Account "Temp" not found').toBeTruthy();

    const accountId = tempAccount?.id as string;

    const transactionsResult = await withTimeout(
      client.callTool('get-transactions', {
        accountId,
        startDate: '2026-01-28',
        endDate: '2026-01-30',
      }),
      'get-transactions',
      15000
    );
    assertToolSuccess(transactionsResult);
    expect(getTextContent(transactionsResult).length).toBeGreaterThan(0);

    const balanceHistoryResult = await withTimeout(
      client.callTool('balance-history', {
        accountId,
        months: 1,
        includeOffBudget: false,
      }),
      'balance-history',
      15000
    );
    assertToolSuccess(balanceHistoryResult);
    expect(getTextContent(balanceHistoryResult).length).toBeGreaterThan(0);

    const spendingByCategoryResult = await withTimeout(
      client.callTool('spending-by-category', {
        accountId,
        startDate: '2026-01-28',
        endDate: '2026-01-30',
        includeIncome: false,
      }),
      'spending-by-category',
      15000
    );
    assertToolSuccess(spendingByCategoryResult);
    expect(getTextContent(spendingByCategoryResult).length).toBeGreaterThan(0);

    const monthlySummaryResult = await withTimeout(
      client.callTool('monthly-summary', {
        accountId,
        months: 1,
      }),
      'monthly-summary',
      15000
    );
    assertToolSuccess(monthlySummaryResult);
    expect(getTextContent(monthlySummaryResult).length).toBeGreaterThan(0);

    const groupedCategoriesResult = await withTimeout(
      client.callTool('get-grouped-categories', {}),
      'get-grouped-categories',
      15000
    );
    assertToolSuccess(groupedCategoriesResult);
    expect(getTextContent(groupedCategoriesResult).length).toBeGreaterThan(0);

    const payeesResult = await withTimeout(client.callTool('get-payees', {}), 'get-payees', 15000);
    assertToolSuccess(payeesResult);
    expect(getTextContent(payeesResult).length).toBeGreaterThan(0);

    const rulesResult = await withTimeout(client.callTool('get-rules', {}), 'get-rules', 15000);
    assertToolSuccess(rulesResult);
    expect(getTextContent(rulesResult).length).toBeGreaterThan(0);
  }, 90000);
});
