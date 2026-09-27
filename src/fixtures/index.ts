import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test as base, expect } from '@playwright/test';
import { FireflyApi } from '../api/firefly-api';
import { config } from '../config';
import { AccountFormPage } from '../pages/account-form-page';
import { LoginPage } from '../pages/auth-pages';
import { ReconcilePage } from '../pages/reconcile-page';
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
  reconcilePage: ReconcilePage;
}

interface WorkerFixtures {
  workerStorageState: string;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  // One browser session per worker. Firefly (Laravel) keeps flash messages and validation errors in the
  // session, so with a shared session a page load in one test could consume another test's messages.
  storageState: ({ workerStorageState }, use) => use(workerStorageState),
  workerStorageState: [
    async ({ browser }, use, workerInfo) => {
      const file = resolve(`.auth/session-${workerInfo.parallelIndex}.json`);
      const page = await browser.newPage({ storageState: undefined, baseURL: config.baseURL });
      const login = new LoginPage(page);
      await login.goto();
      expect(await login.login(config.user.email, config.user.password), 'worker login').toBe(true);
      await page.context().storageState({ path: file });
      await page.close();
      await use(file);
    },
    { scope: 'worker' },
  ],

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
  reconcilePage: async ({ page }, use) => use(new ReconcilePage(page)),
});

export { expect };
