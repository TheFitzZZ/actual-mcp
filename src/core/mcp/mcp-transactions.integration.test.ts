import { describe, it, expect } from 'vitest';
import dotenv from 'dotenv';
import { McpClient } from './mcp-client.js';
import { formatAmount } from '../../utils.js';

dotenv.config({ path: '.env.test' });

interface ExpectedTransaction {
  date: string;
  payeeName: string;
  amount: number;
  importedId: string;
}

const TRANSACTIONS: ExpectedTransaction[] = [
  {
    date: '2026-01-30',
    payeeName: 'Christoph Suser',
    amount: -70600,
    importedId: 'mcp-temp-2026-01-30-christoph-suser-70600',
  },
  {
    date: '2026-01-30',
    payeeName: 'Amazon',
    amount: -1998,
    importedId: 'mcp-temp-2026-01-30-amazon-1998',
  },
  {
    date: '2026-01-30',
    payeeName: 'Hamburg UKE Parkhaus',
    amount: -900,
    importedId: 'mcp-temp-2026-01-30-hamburg-uke-parkhaus-900',
  },
  {
    date: '2026-01-29',
    payeeName: 'Sodexo',
    amount: -3600,
    importedId: 'mcp-temp-2026-01-29-sodexo-3600',
  },
  {
    date: '2026-01-29',
    payeeName: '6213 DB HH-Airport',
    amount: -280,
    importedId: 'mcp-temp-2026-01-29-6213-db-hh-airport-280',
  },
  {
    date: '2026-01-28',
    payeeName: 'MSCI Global Semiconductors',
    amount: -49670,
    importedId: 'mcp-temp-2026-01-28-msci-global-semiconductors-49670',
  },
  {
    date: '2026-01-28',
    payeeName: 'Physical Gold USD (Acc)',
    amount: -51226,
    importedId: 'mcp-temp-2026-01-28-physical-gold-usd-acc-51226',
  },
];

const parseTableRows = (markdown: string): Array<{ date: string; payee: string; amount: string }> => {
  const lines = markdown.split('\n').map((line) => line.trim());
  const headerIndex = lines.findIndex((line) => line.startsWith('| ID | Date | Payee |'));
  if (headerIndex === -1) {
    return [];
  }

  return lines
    .slice(headerIndex + 2)
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((value) => value.trim()))
    .map((columns) => ({
      date: columns[1],
      payee: columns[2],
      amount: columns[4],
    }));
};

const normalizePayee = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const payeeMatches = (actual: string, expected: string): boolean => {
  if (!actual || !expected) return false;
  const actualNormalized = normalizePayee(actual);
  const expectedNormalized = normalizePayee(expected);
  return actualNormalized.includes(expectedNormalized) || expectedNormalized.includes(actualNormalized);
};

const getTextContent = (result: { content: Array<{ type: string; text?: string }> }): string => {
  const textItem = result.content.find((item) => item.type === 'text');
  return textItem?.text ?? '';
};

const assertToolSuccess = (result: { isError?: boolean; content: Array<{ type: string; text?: string }> }) => {
  if (result.isError) {
    throw new Error(getTextContent(result));
  }
};

const baseUrl = process.env.MCP_BASE_URL;
const bearerToken = process.env.MCP_BEARER_TOKEN;
const integration = baseUrl ? describe : describe.skip;

integration('MCP Temp transaction seeding', () => {
  it('creates missing Temp transactions and verifies them', async () => {
    const client = new McpClient({ baseUrl: baseUrl as string, bearerToken });
    await client.initialize();

    const accountsResult = await client.callTool('get-accounts', {});
    assertToolSuccess(accountsResult);
    const accounts = JSON.parse(getTextContent(accountsResult)) as Array<{ id: string; name: string }>;
    const tempAccount = accounts.find((account) => account.name === 'Temp');

    expect(tempAccount, 'Account "Temp" not found').toBeTruthy();

    const accountId = tempAccount?.id as string;

    const currentTransactionsResult = await client.callTool('get-transactions', {
      accountId,
      startDate: '2026-01-28',
      endDate: '2026-01-30',
    });
    assertToolSuccess(currentTransactionsResult);

    const existingRows = parseTableRows(getTextContent(currentTransactionsResult));

    const missing = TRANSACTIONS.filter((tx) => {
      const expectedAmount = formatAmount(tx.amount);
      return !existingRows.some(
        (row) => row.date === tx.date && row.amount === expectedAmount && payeeMatches(row.payee, tx.payeeName)
      );
    });

    const createResults = await Promise.all(
      missing.map((tx) =>
        client.callTool('create-transaction', {
          account: accountId,
          date: tx.date,
          amount: tx.amount,
          payee_name: tx.payeeName,
          imported_id: tx.importedId,
        })
      )
    );

    createResults.forEach(assertToolSuccess);

    const updatedTransactionsResult = await client.callTool('get-transactions', {
      accountId,
      startDate: '2026-01-28',
      endDate: '2026-01-30',
    });
    assertToolSuccess(updatedTransactionsResult);

    const updatedRows = parseTableRows(getTextContent(updatedTransactionsResult));

    for (const tx of TRANSACTIONS) {
      const expectedAmount = formatAmount(tx.amount);
      const match = updatedRows.find(
        (row) => row.date === tx.date && row.amount === expectedAmount && payeeMatches(row.payee, tx.payeeName)
      );

      expect(match, `Missing ${tx.payeeName} ${tx.date} ${expectedAmount}`).toBeTruthy();
    }
  });
});
