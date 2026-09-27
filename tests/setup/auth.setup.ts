import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { test as setup, expect } from '@playwright/test';
import { config } from '../../src/config';
import { markAllToursAsSeen } from '../../src/pages/tours';
import { LoginPage, NewUserPage, RegisterPage, TokenPage } from '../../src/pages/auth-pages';

setup('prepare user, session and API token', async ({ page }) => {
  const { email, password } = config.user;

  // A fresh instance (always the case in CI) has no users and sends /login to /register.
  // Locally the same instance is reused, so the user usually exists already.
  const login = new LoginPage(page);
  await login.goto();
  const isFreshInstance = page.url().endsWith('/register');
  if (isFreshInstance || !(await login.login(email, password))) {
    await new RegisterPage(page).register(email, password);
  }

  const wizard = new NewUserPage(page);
  if (wizard.isShown()) {
    await wizard.complete('Setup Bank');
  }

  await markAllToursAsSeen(page);

  const token = await new TokenPage(page).createPersonalAccessToken(`suite-${Date.now()}`);

  // Sanity check before any test relies on the token.
  const about = await page.request.get('/api/v1/about/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  expect(about.status()).toBe(200);

  await mkdir(dirname(config.tokenPath), { recursive: true });
  await writeFile(config.tokenPath, JSON.stringify({ token }));
  await page.context().storageState({ path: config.storageStatePath });
});
