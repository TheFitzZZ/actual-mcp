import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApi = {
  init: vi.fn(),
  getBudgets: vi.fn(),
  downloadBudget: vi.fn(),
  getAccounts: vi.fn(),
  addTransactions: vi.fn(),
  shutdown: vi.fn(),
  getAccountBalance: vi.fn(),
  getCategories: vi.fn(),
  getCategoryGroups: vi.fn(),
  getPayees: vi.fn(),
  getTransactions: vi.fn(),
  getRules: vi.fn(),
  createPayee: vi.fn(),
  updatePayee: vi.fn(),
  deletePayee: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  createCategoryGroup: vi.fn(),
  updateCategoryGroup: vi.fn(),
  deleteCategoryGroup: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
};

vi.mock('@actual-app/api', () => ({
  default: mockApi,
}));

const loadActualApi = async () => {
  vi.resetModules();
  return import('./actual-api.js');
};

describe('actual-api concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.init.mockResolvedValue(undefined);
    mockApi.getBudgets.mockResolvedValue([{ id: 'budget-1', cloudFileId: 'cloud-1' }]);
    mockApi.downloadBudget.mockResolvedValue(undefined);
    mockApi.getAccounts.mockResolvedValue([]);
    mockApi.addTransactions.mockResolvedValue('tx-1');
  });

  it('initializes once across concurrent calls', async () => {
    const { getAccounts } = await loadActualApi();

    await Promise.all([getAccounts(), getAccounts()]);

    expect(mockApi.init).toHaveBeenCalledTimes(1);
    expect(mockApi.getBudgets).toHaveBeenCalledTimes(1);
    expect(mockApi.downloadBudget).toHaveBeenCalledTimes(1);
  });

  it('serializes transaction creation calls', async () => {
    const { createTransaction } = await loadActualApi();

    let resolveFirst!: (value: string) => void;
    mockApi.addTransactions
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce('tx-2');

    const first = createTransaction('account-1', { date: '2026-01-30', amount: -1998 });
    const second = createTransaction('account-1', { date: '2026-01-30', amount: -900 });

    await Promise.resolve();

    expect(mockApi.addTransactions).toHaveBeenCalledTimes(1);

    resolveFirst('tx-1');

    await Promise.all([first, second]);

    expect(mockApi.addTransactions).toHaveBeenCalledTimes(2);
  });

  it('surfaces initialization errors', async () => {
    mockApi.getBudgets.mockResolvedValue([]);

    const { getAccounts } = await loadActualApi();

    await expect(getAccounts()).rejects.toThrow('No budgets found');
  });
});
