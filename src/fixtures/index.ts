import { resolve } from 'node:path';
import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { FireflyApi } from '../api/firefly-api';
import { config } from '../config';
import { AccountFormPage } from '../pages/account-form-page';
import { prepareUser } from '../pages/prepare-user';
import { ReconcilePage } from '../pages/reconcile-page';
import { TransactionDeletePage, TransactionFormPage } from '../pages/transaction-form-page';

interface Fixtures {
  /** API client authenticated as this worker's user. */
  api: FireflyApi;
  /** HTTP client with no token and no cookies, for testing what unauthenticated callers get. */
  anonymousRequest: APIRequestContext;
  accountForm: AccountFormPage;
  transactionForm: TransactionFormPage;
  transactionDelete: TransactionDeletePage;
  reconcilePage: ReconcilePage;
  /** Creates a category rule that is deleted after the test. */
  categoryRule: (input: { keyword: string; category: string }) => Promise<void>;
  /** Uncaught JavaScript errors on the page. Checked automatically after every test. */
  pageErrors: Error[];
}

interface WorkerFixtures {
  workerUser: { email: string; token: string; storageStatePath: string };
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  // One new Firefly user per worker, registered when the worker starts. Separate users mean separate
  // sessions (Laravel keeps flash messages and validation errors in the session) and separate data
  // (rules and budgets apply to everything a user owns). Registering instead of logging in also stays
  // clear of Firefly's login limit of 5 attempts per minute per IP address.
  workerUser: [
    async ({ browser }, use, workerInfo) => {
      const user = config.newWorkerUser(workerInfo.parallelIndex);
      const page = await browser.newPage({ baseURL: config.baseURL, storageState: undefined });
      const token = await prepareUser(page, user, 'new');
      const storageStatePath = resolve(`.auth/worker-${workerInfo.parallelIndex}.json`);
      await page.context().storageState({ path: storageStatePath });
      await page.close();
      await use({ email: user.email, token, storageStatePath });
    },
    // Its own budget: registering and preparing a user must not eat the first test's timeout.
    { scope: 'worker', timeout: 60_000 },
  ],
  storageState: ({ workerUser }, use) => use(workerUser.storageStatePath),

  api: async ({ playwright, workerUser }, use) => {
    const request = await playwright.request.newContext({
      baseURL: config.baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${workerUser.token}`, Accept: 'application/json' },
    });
    await use(new FireflyApi(request));
    await request.dispose();
  },
  anonymousRequest: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({ baseURL: config.baseURL, storageState: undefined });
    await use(request);
    await request.dispose();
  },

  // A broken script can leave a screen looking fine while it silently stops working, so any uncaught
  // error on the page fails the test. A test that expects one can read and clear `pageErrors`.
  pageErrors: [
    async ({ page }, use) => {
      const errors: Error[] = [];
      page.on('pageerror', (error) => errors.push(error));
      await use(errors);
      expect(
        errors.map((e) => e.message),
        'uncaught errors on the page',
      ).toEqual([]);
    },
    { auto: true },
  ],

  accountForm: async ({ page }, use) => use(new AccountFormPage(page)),
  transactionForm: async ({ page }, use) => use(new TransactionFormPage(page)),
  transactionDelete: async ({ page }, use) => use(new TransactionDeletePage(page)),
  reconcilePage: async ({ page }, use) => use(new ReconcilePage(page)),
  categoryRule: async ({ api }, use) => {
    const groups: string[] = [];
    await use(async (input) => {
      groups.push((await api.createCategoryRule(input)).groupId);
    });
    for (const groupId of groups) await api.deleteRuleGroup(groupId);
  },
});

export { expect };
