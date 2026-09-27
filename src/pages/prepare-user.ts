import type { Page } from '@playwright/test';
import { LoginPage, NewUserPage, RegisterPage, TokenPage } from './auth-pages';
import { markAllToursAsSeen } from './tours';

/**
 * Brings a user to a usable state through the UI and returns a fresh API token:
 * gets a logged-in session, completes the first-run wizard, marks the guided tours as seen and
 * creates a Personal Access Token.
 *
 * `new` always registers, which also logs the user in. `existing` logs in and registers only when the
 * login is rejected. Prefer `new`: Firefly allows 5 login attempts per minute per IP address (not per
 * user), and the whole suite runs from one IP.
 */
export async function prepareUser(
  page: Page,
  user: { email: string; password: string },
  mode: 'new' | 'existing',
): Promise<string> {
  if (mode === 'new') {
    await new RegisterPage(page).register(user.email, user.password);
  } else {
    const login = new LoginPage(page);
    await login.goto();
    // A fresh instance has no users at all and sends /login to /register.
    const isFreshInstance = page.url().endsWith('/register');
    if (isFreshInstance || !(await login.login(user.email, user.password))) {
      await new RegisterPage(page).register(user.email, user.password);
    }
  }

  const wizard = new NewUserPage(page);
  if (wizard.isShown()) {
    await wizard.complete('Setup Bank');
  }

  await markAllToursAsSeen(page);
  return new TokenPage(page).createPersonalAccessToken(`suite-${Date.now()}`);
}
