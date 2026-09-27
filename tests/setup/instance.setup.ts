import { test as setup, expect } from '@playwright/test';
import { config } from '../../src/config';
import { prepareUser } from '../../src/pages/prepare-user';

// Runs once per test run, before any worker starts.

setup('instance is up and open for the worker users', async ({ page, playwright }) => {
  const health = await page.request.get('/health');
  expect(
    health.ok(),
    `Firefly III is not reachable at ${config.baseURL}. Did you run "npm run env:up"?`,
  ).toBe(true);

  // The first user becomes the administrator. After that Firefly closes registration ("single user mode"),
  // so the admin opens it again for the per-worker users.
  const adminToken = await prepareUser(page, config.admin, 'existing');
  const adminApi = await playwright.request.newContext({
    baseURL: config.baseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${adminToken}`, Accept: 'application/json' },
  });
  const response = await adminApi.put('/api/v1/configuration/configuration.single_user_mode', {
    data: { value: false },
  });
  await expect(response).toBeOK();
  await adminApi.dispose();
});
