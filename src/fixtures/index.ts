import { readFile } from 'node:fs/promises';
import { test as base } from '@playwright/test';
import { FireflyApi } from '../api/firefly-api';
import { config } from '../config';
import { AccountFormPage } from '../pages/account-form-page';
import { TransactionDeletePage, TransactionFormPage } from '../pages/transaction-form-page';

export async function readToken(): Promise<string> {
  return (JSON.parse(await readFile(config.tokenPath, 'utf8')) as { token: string }).token;
}

interface Fixtures {
  /** API client authenticated with the suite's Personal Access Token. */
  api: FireflyApi;
  accountForm: AccountFormPage;
  transactionForm: TransactionFormPage;
  transactionDelete: TransactionDeletePage;
}

export const test = base.extend<Fixtures>({
  api: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({
      baseURL: config.baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${await readToken()}`, Accept: 'application/json' },
    });
    await use(new FireflyApi(request));
    await request.dispose();
  },
  accountForm: async ({ page }, use) => use(new AccountFormPage(page)),
  transactionForm: async ({ page }, use) => use(new TransactionFormPage(page)),
  transactionDelete: async ({ page }, use) => use(new TransactionDeletePage(page)),
});

export { expect } from '@playwright/test';
