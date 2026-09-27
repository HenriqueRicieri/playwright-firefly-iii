import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { step } from '../step';
import { z } from 'zod';
import { pastDate } from '../data/builders';
import {
  AccountResource,
  BudgetLimitResource,
  envelope,
  IdOnlyResource,
  TransactionResource,
  ValidationError,
  type StoredTransactionType,
  type TransactionType,
} from './schemas';

export interface Account {
  id: string;
  name: string;
  currentBalance: string;
  openingBalance: string | null;
  currencyCode: string;
}

export interface TransactionSplit {
  journalId: string;
  type: z.infer<typeof StoredTransactionType>;
  date: string;
  description: string;
  amount: string;
  currencyCode: string;
  foreignAmount: string | null;
  foreignCurrencyCode: string | null;
  sourceId: string;
  sourceName: string;
  destinationId: string;
  destinationName: string;
  reconciled: boolean;
  categoryName: string | null;
  budgetId: string | null;
}

export interface Transaction {
  id: string;
  groupTitle: string | null;
  splits: TransactionSplit[];
}

export interface NewSplit {
  type: z.infer<typeof TransactionType>;
  description: string;
  amount: string;
  date?: string;
  sourceId?: string;
  sourceName?: string;
  destinationId?: string;
  destinationName?: string;
  /** Required by Firefly when source and destination use different currencies. */
  foreignAmount?: string;
  foreignCurrencyCode?: string;
}

export type ValidationErrorBody = z.infer<typeof ValidationError>;

/** Thin client over the Firefly III REST API (/api/v1). Only what the suite needs. */
export class FireflyApi {
  constructor(readonly request: APIRequestContext) {}

  /**
   * POST with one narrow retry. Firefly reorders a user's accounts inside a transaction, and two requests
   * close together can make MariaDB abort one with a deadlock (SQLSTATE 40001, "try restarting
   * transaction"). Firefly returns that as a 500 instead of retrying. The database rolled the transaction back, so sending
   * it again cannot store anything twice. This retries that error only, once,
   * and records it on the test so it stays visible in the report. Any other failure is returned as is.
   */
  private async post(url: string, options: Parameters<APIRequestContext['post']>[1]): Promise<APIResponse> {
    const response = await this.request.post(url, options);
    if (response.status() !== 500 || !(await response.text()).includes('SQLSTATE[40001]')) return response;
    test.info().annotations.push({
      type: 'firefly deadlock retried',
      description: `POST ${url} returned 500 with a database deadlock (SQLSTATE 40001) and was sent again.`,
    });
    return this.request.post(url, options);
  }

  // Accounts

  @step
  async createAssetAccount(input: {
    name: string;
    openingBalance?: string;
    currencyCode?: string;
  }): Promise<Account> {
    const response = await this.post('/api/v1/accounts', {
      data: {
        name: input.name,
        type: 'asset',
        account_role: 'defaultAsset',
        currency_code: input.currencyCode,
        ...(input.openingBalance !== undefined && {
          opening_balance: input.openingBalance,
          opening_balance_date: pastDate(30),
        }),
      },
    });
    return toAccount(await parse(response, envelope(AccountResource)));
  }

  @step
  async getAccount(id: string): Promise<Account> {
    return toAccount(
      await parse(await this.request.get(`/api/v1/accounts/${id}`), envelope(AccountResource)),
    );
  }

  @step
  async balanceOf(accountId: string): Promise<string> {
    return (await this.getAccount(accountId)).currentBalance;
  }

  /** Exact-name lookup. Safe because every test creates its own uniquely named accounts. */
  @step
  async findAssetAccountByName(name: string): Promise<Account> {
    const response = await this.request.get('/api/v1/search/accounts', {
      params: { query: name, field: 'name', type: 'asset' },
    });
    const all = await parse(response, envelope(z.array(AccountResource)));
    const matches = all.filter((a) => a.attributes.name === name);
    expect(matches, `asset accounts named "${name}"`).toHaveLength(1);
    return toAccount(matches[0]!);
  }

  // Currencies

  /** Enables a currency for the user, as a user would under Options > Currencies. */
  @step
  async enableCurrency(code: string) {
    await expect(await this.post(`/api/v1/currencies/${code}/enable`, { data: {} })).toBeOK();
  }

  // Transactions

  @step
  async createTransaction(split: NewSplit): Promise<Transaction> {
    return this.createSplitTransaction({ splits: [split] });
  }

  /** One transaction group with several splits, e.g. a single receipt paid for different things. */
  @step
  async createSplitTransaction(input: { groupTitle?: string; splits: NewSplit[] }): Promise<Transaction> {
    const response = await this.postTransaction(input);
    return toTransaction(await parse(response, envelope(TransactionResource)));
  }

  /** Raw POST /transactions, for tests that check how invalid input is rejected. */
  @step
  async postTransaction(input: { groupTitle?: string; splits: NewSplit[] }): Promise<APIResponse> {
    return this.post('/api/v1/transactions', {
      data: {
        error_if_duplicate_hash: false,
        group_title: input.groupTitle,
        transactions: input.splits.map((s) => ({
          type: s.type,
          date: s.date ?? pastDate(),
          amount: s.amount,
          description: s.description,
          source_id: s.sourceId,
          source_name: s.sourceName,
          destination_id: s.destinationId,
          destination_name: s.destinationName,
          foreign_amount: s.foreignAmount,
          foreign_currency_code: s.foreignCurrencyCode,
        })),
      },
    });
  }

  @step
  async getTransaction(id: string): Promise<Transaction> {
    return toTransaction(
      await parse(await this.request.get(`/api/v1/transactions/${id}`), envelope(TransactionResource)),
    );
  }

  /** Every split that touches the account, newest first. */
  @step
  async splitsOf(accountId: string): Promise<TransactionSplit[]> {
    const response = await this.request.get(`/api/v1/accounts/${accountId}/transactions`, {
      params: { limit: 100 },
    });
    const groups = await parse(response, envelope(z.array(TransactionResource)));
    return groups.flatMap((g) => toTransaction(g).splits);
  }

  /** Status of GET /transactions/{id}, for checking that something was really deleted. */
  @step
  async transactionStatus(id: string): Promise<number> {
    return (await this.request.get(`/api/v1/transactions/${id}`)).status();
  }

  // Budgets

  /** A budget with one limit for the given period. */
  @step
  async createBudget(input: { name: string; limit: string; start: string; end: string }) {
    const budget = await parse(
      await this.post('/api/v1/budgets', { data: { name: input.name } }),
      envelope(IdOnlyResource),
    );
    const limit = await parse(
      await this.post(`/api/v1/budgets/${budget.id}/limits`, {
        data: { start: input.start, end: input.end, amount: input.limit },
      }),
      envelope(IdOnlyResource),
    );
    return { id: budget.id, name: input.name, limitId: limit.id };
  }

  /** What has been spent against a budget limit, as Firefly reports it (negative, or "0" if nothing). */
  @step
  async spentOnLimit(budgetId: string, limitId: string): Promise<string> {
    const limit = await parse(
      await this.request.get(`/api/v1/budgets/${budgetId}/limits/${limitId}`),
      envelope(BudgetLimitResource),
    );
    return limit.attributes.spent[0]?.sum ?? '0';
  }

  // Rules

  /**
   * Creates an active rule "description contains <keyword> -> set category <category>" in its own group.
   * Rules apply to every transaction of the user, so tests must use a unique keyword.
   */
  @step
  async createCategoryRule(input: {
    keyword: string;
    category: string;
  }): Promise<{ ruleId: string; groupId: string }> {
    const group = await parse(
      await this.post('/api/v1/rule-groups', { data: { title: `Group for ${input.keyword}` } }),
      envelope(IdOnlyResource),
    );
    const rule = await parse(
      await this.post('/api/v1/rules', {
        data: {
          title: `Categorize ${input.keyword}`,
          rule_group_id: group.id,
          trigger: 'store-journal',
          active: true,
          strict: true,
          triggers: [{ type: 'description_contains', value: input.keyword }],
          actions: [{ type: 'set_category', value: input.category }],
        },
      }),
      envelope(IdOnlyResource),
    );
    return { ruleId: rule.id, groupId: group.id };
  }

  @step
  async deleteRuleGroup(groupId: string) {
    // Deleting the group deletes its rules too.
    expect((await this.request.delete(`/api/v1/rule-groups/${groupId}`)).status()).toBe(204);
  }
}

/**
 * Checks the status, then validates the body against its schema and unwraps `data`.
 * toBeOK() prints the response body on failure, which is where Firefly puts validation errors.
 */
async function parse<T extends z.ZodType<{ data: unknown }>>(
  response: APIResponse,
  schema: T,
): Promise<z.infer<T>['data']> {
  await expect(response).toBeOK();
  return parseBody(response, schema).then((body) => body.data);
}

/** Validates any response body (including error bodies) against a schema. */
export async function parseBody<T extends z.ZodType>(response: APIResponse, schema: T): Promise<z.infer<T>> {
  const result = schema.safeParse(await response.json());
  if (!result.success) {
    throw new Error(
      `Response of ${response.url()} does not match the expected contract:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

function toAccount(resource: z.infer<typeof AccountResource>): Account {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    currentBalance: a.current_balance,
    openingBalance: a.opening_balance,
    currencyCode: a.currency_code,
  };
}

function toTransaction(resource: z.infer<typeof TransactionResource>): Transaction {
  return {
    id: resource.id,
    groupTitle: resource.attributes.group_title,
    splits: resource.attributes.transactions.map((t) => ({
      journalId: t.transaction_journal_id,
      type: t.type,
      date: t.date,
      description: t.description,
      amount: t.amount,
      currencyCode: t.currency_code,
      foreignAmount: t.foreign_amount,
      foreignCurrencyCode: t.foreign_currency_code,
      sourceId: t.source_id,
      sourceName: t.source_name,
      destinationId: t.destination_id,
      destinationName: t.destination_name,
      reconciled: t.reconciled,
      categoryName: t.category_name,
      budgetId: t.budget_id,
    })),
  };
}
