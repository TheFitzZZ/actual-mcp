import api from '@actual-app/api';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BudgetFile, TransactionData, UpdateTransactionData } from './types.js';
import {
  APIAccountEntity,
  APICategoryEntity,
  APICategoryGroupEntity,
  APIPayeeEntity,
} from '@actual-app/api/@types/loot-core/src/server/api-models.js';
import { RuleEntity, TransactionEntity } from '@actual-app/api/@types/loot-core/src/types/models/index.js';

const DEFAULT_DATA_DIR: string = path.resolve(os.homedir() || '.', '.actual');

// API initialization state
let initialized = false;
let initializationPromise: Promise<void> | null = null;
let initializationError: Error | null = null;

let apiOperationQueue: Promise<void> = Promise.resolve();

const runWithApiLock = async <T>(operation: () => Promise<T>): Promise<T> => {
  // #Reason: serialize Actual API operations to prevent parallel calls from corrupting the shared API state.
  const run = () => operation();
  const resultPromise = apiOperationQueue.then(run, run);
  apiOperationQueue = resultPromise.then(() => undefined, () => undefined);
  return resultPromise;
};

/**
 * Initialize the Actual Budget API
 */
export async function initActualApi(): Promise<void> {
  if (initialized) return;
  if (initializationPromise) {
    await initializationPromise;
    if (initializationError) throw initializationError;
    return;
  }

  initializationPromise = (async () => {
    initializationError = null;
    try {
      console.error('Initializing Actual Budget API...');
      const dataDir = process.env.ACTUAL_DATA_DIR || DEFAULT_DATA_DIR;
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      await api.init({
        dataDir,
        serverURL: process.env.ACTUAL_SERVER_URL,
        password: process.env.ACTUAL_PASSWORD,
      });

      const budgets: BudgetFile[] = await api.getBudgets();
      if (!budgets || budgets.length === 0) {
        throw new Error('No budgets found. Please create a budget in Actual first.');
      }

      // Use specified budget or the first one
      const budgetId: string = process.env.ACTUAL_BUDGET_SYNC_ID || budgets[0].cloudFileId || budgets[0].id || '';
      console.error(`Loading budget: ${budgetId}`);
      await api.downloadBudget(
        budgetId,
        process.env.ACTUAL_BUDGET_ENCRYPTION_PASSWORD
          ? {
              password: process.env.ACTUAL_BUDGET_ENCRYPTION_PASSWORD,
            }
          : undefined
      );

      initialized = true;
      console.error('Actual Budget API initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Actual Budget API:', error);
      initializationError = error instanceof Error ? error : new Error(String(error));
      initialized = false;
      throw initializationError;
    } finally {
      initializationPromise = null;
    }
  })();

  await initializationPromise;
}

/**
 * Shutdown the Actual Budget API
 */
export async function shutdownActualApi(): Promise<void> {
  await runWithApiLock(async () => {
    if (initializationPromise) {
      await initializationPromise;
    }
    if (!initialized) return;
    await api.shutdown();
    initialized = false;
  });
}

// ----------------------------
// FETCH
// ----------------------------

/**
 * Get all accounts (ensures API is initialized)
 */
export async function getAccounts(): Promise<APIAccountEntity[]> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.getAccounts();
  });
}

/**
 * Get account balance (ensures API is initialized)
 */
export async function getAccountBalance(accountId: string): Promise<number> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.getAccountBalance(accountId);
  });
}

/**
 * Get all categories (ensures API is initialized)
 */
export async function getCategories(): Promise<APICategoryEntity[]> {
  return runWithApiLock(async () => {
    await initActualApi();
    const categories = await api.getCategories();
    return categories.filter((item): item is APICategoryEntity => 'group_id' in item);
  });
}

/**
 * Get all category groups (ensures API is initialized)
 */
export async function getCategoryGroups(): Promise<APICategoryGroupEntity[]> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.getCategoryGroups();
  });
}

/**
 * Get all payees (ensures API is initialized)
 */
export async function getPayees(): Promise<APIPayeeEntity[]> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.getPayees();
  });
}

/**
 * Get transactions for a specific account and date range (ensures API is initialized)
 */
export async function getTransactions(accountId: string, start: string, end: string): Promise<TransactionEntity[]> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.getTransactions(accountId, start, end);
  });
}

/**
 * Get all rules (ensures API is initialized)
 */
export async function getRules(): Promise<RuleEntity[]> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.getRules();
  });
}

// ----------------------------
// ACTION
// ----------------------------

/**
 * Create a new payee (ensures API is initialized)
 */
export async function createPayee(args: Omit<APIPayeeEntity, 'id'>): Promise<string> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.createPayee(args);
  });
}

/**
 * Update a payee (ensures API is initialized)
 */
export async function updatePayee(id: string, args: Partial<Omit<APIPayeeEntity, 'id'>>): Promise<unknown> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.updatePayee(id, args);
  });
}

/**
 * Delete a payee (ensures API is initialized)
 */
export async function deletePayee(id: string): Promise<unknown> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.deletePayee(id);
  });
}

/**
 * Create a new rule (ensures API is initialized)
 */
export async function createRule(args: Omit<RuleEntity, 'id'>): Promise<RuleEntity> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.createRule(args);
  });
}

/**
 * Update a rule (ensures API is initialized)
 */
export async function updateRule(args: RuleEntity): Promise<RuleEntity> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.updateRule(args);
  });
}

/**
 * Delete a rule (ensures API is initialized)
 */
export async function deleteRule(id: string): Promise<boolean> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.deleteRule(id);
  });
}

/**
 * Create a new category (ensures API is initialized)
 */
export async function createCategory(args: Omit<APICategoryEntity, 'id'>): Promise<string> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.createCategory(args);
  });
}

/**
 * Update a category (ensures API is initialized)
 */
export async function updateCategory(id: string, args: Partial<Omit<APICategoryEntity, 'id'>>): Promise<unknown> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.updateCategory(id, args);
  });
}

/**
 * Delete a category (ensures API is initialized)
 */
export async function deleteCategory(id: string): Promise<{ error?: string }> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.deleteCategory(id);
  });
}

/**
 * Create a new category group (ensures API is initialized)
 */
export async function createCategoryGroup(args: Omit<APICategoryGroupEntity, 'id'>): Promise<string> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.createCategoryGroup(args);
  });
}

/**
 * Update a category group (ensures API is initialized)
 */
export async function updateCategoryGroup(
  id: string,
  args: Partial<Omit<APICategoryGroupEntity, 'id'>>
): Promise<unknown> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.updateCategoryGroup(id, args);
  });
}

/**
 * Delete a category group (ensures API is initialized)
 */
export async function deleteCategoryGroup(id: string): Promise<unknown> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.deleteCategoryGroup(id);
  });
}

/**
 * Create a transaction (ensures API is initialized)
 */
export async function createTransaction(accountId: string, data: TransactionData): Promise<string> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.addTransactions(accountId, [data]);
  });
}

/**
 * Update a transaction (ensures API is initialized)
 */
export async function updateTransaction(id: string, data: UpdateTransactionData): Promise<unknown> {
  return runWithApiLock(async () => {
    await initActualApi();
    const normalizedSubtransactions = data.subtransactions?.map((subtransaction) => ({
      ...subtransaction,
    })) as TransactionEntity[] | undefined;

    const payload: Partial<TransactionEntity> = {
      ...data,
      subtransactions: normalizedSubtransactions,
    };

    return api.updateTransaction(id, payload);
  });
}

/**
 * Delete a transaction (ensures API is initialized)
 */
export async function deleteTransaction(id: string): Promise<unknown> {
  return runWithApiLock(async () => {
    await initActualApi();
    return api.deleteTransaction(id);
  });
}
