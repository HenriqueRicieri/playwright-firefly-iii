import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { pastDate } from '../data/builders';

export type TransactionType = 'withdrawal' | 'deposit' | 'transfer';

/** Types Firefly creates on its own, e.g. the correction stored by a reconciliation. */
export type StoredTransactionType = TransactionType | 'reconciliation' | 'opening balance';

export interface Account {
  id: string;
  name: string;
  currentBalance: string;
  openingBalance: string | null;
  currencyCode: string;
}

export interface TransactionSplit {
  journalId: string;
  type: StoredTransactionType;
  date: string;
  description: string;
  amount: string;
  sourceId: string;
  sourceName: string;
  destinationId: string;
  destinationName: string;
  reconciled: boolean;
}

export interface Transaction {
  id: string;
  splits: TransactionSplit[];
}

export interface NewTransaction {
  type: TransactionType;
  description: string;
  amount: string;
  date?: string;
  sourceId?: string;
  sourceName?: string;
  destinationId?: string;
  destinationName?: string;
}

interface AccountResource {
  id: string;
  attributes: {
    name: string;
    current_balance: string;
    opening_balance: string | null;
    currency_code: string;
  };
}

interface TransactionResource {
  id: string;
  attributes: {
    transactions: {
      transaction_journal_id: string;
      type: StoredTransactionType;
      date: string;
      description: string;
      amount: string;
      source_id: string;
      source_name: string;
      destination_id: string;
      destination_name: string;
      reconciled: boolean;
    }[];
  };
}

/** Thin client over the Firefly III REST API (/api/v1). Only what the suite needs. */
export class FireflyApi {
  constructor(readonly request: APIRequestContext) {}

  // Accounts

  async createAssetAccount(input: { name: string; openingBalance?: string }): Promise<Account> {
    const response = await this.request.post('/api/v1/accounts', {
      data: {
        name: input.name,
        type: 'asset',
        account_role: 'defaultAsset',
        ...(input.openingBalance !== undefined && {
          opening_balance: input.openingBalance,
          opening_balance_date: pastDate(30),
        }),
      },
    });
    return toAccount(await dataOf<AccountResource>(response));
  }

  async getAccount(id: string): Promise<Account> {
    return toAccount(await dataOf<AccountResource>(await this.request.get(`/api/v1/accounts/${id}`)));
  }

  async balanceOf(accountId: string): Promise<string> {
    return (await this.getAccount(accountId)).currentBalance;
  }

  /** Exact-name lookup. Safe because every test creates its own uniquely named accounts. */
  async findAssetAccountByName(name: string): Promise<Account> {
    const response = await this.request.get('/api/v1/search/accounts', {
      params: { query: name, field: 'name', type: 'asset' },
    });
    const matches = (await dataOf<AccountResource[]>(response)).filter((a) => a.attributes.name === name);
    expect(matches, `asset accounts named "${name}"`).toHaveLength(1);
    return toAccount(matches[0]!);
  }

  // Transactions

  async createTransaction(input: NewTransaction): Promise<Transaction> {
    const response = await this.request.post('/api/v1/transactions', {
      data: {
        error_if_duplicate_hash: false,
        transactions: [
          {
            type: input.type,
            date: input.date ?? pastDate(),
            amount: input.amount,
            description: input.description,
            source_id: input.sourceId,
            source_name: input.sourceName,
            destination_id: input.destinationId,
            destination_name: input.destinationName,
          },
        ],
      },
    });
    return toTransaction(await dataOf<TransactionResource>(response));
  }

  async getTransaction(id: string): Promise<Transaction> {
    return toTransaction(
      await dataOf<TransactionResource>(await this.request.get(`/api/v1/transactions/${id}`)),
    );
  }

  /** Every split that touches the account, newest first. */
  async splitsOf(accountId: string): Promise<TransactionSplit[]> {
    const response = await this.request.get(`/api/v1/accounts/${accountId}/transactions`, {
      params: { limit: 100 },
    });
    return (await dataOf<TransactionResource[]>(response)).flatMap((r) => toTransaction(r).splits);
  }

  /** Status of GET /transactions/{id}, for checking that something was really deleted. */
  async transactionStatus(id: string): Promise<number> {
    return (await this.request.get(`/api/v1/transactions/${id}`)).status();
  }
}

async function dataOf<T>(response: APIResponse): Promise<T> {
  // toBeOK() prints the response body on failure, which is where Firefly puts validation errors.
  await expect(response).toBeOK();
  return ((await response.json()) as { data: T }).data;
}

function toAccount(resource: AccountResource): Account {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    currentBalance: a.current_balance,
    openingBalance: a.opening_balance,
    currencyCode: a.currency_code,
  };
}

function toTransaction(resource: TransactionResource): Transaction {
  return {
    id: resource.id,
    splits: resource.attributes.transactions.map((t) => ({
      journalId: t.transaction_journal_id,
      type: t.type,
      date: t.date,
      description: t.description,
      amount: t.amount,
      sourceId: t.source_id,
      sourceName: t.source_name,
      destinationId: t.destination_id,
      destinationName: t.destination_name,
      reconciled: t.reconciled,
    })),
  };
}
