import { expect, type Page, type Request } from '@playwright/test';
import { step } from '../step';

export class LoginPage {
  constructor(private readonly page: Page) {}

  @step
  async goto() {
    await this.page.goto('/login');
  }

  /** Returns false when the credentials were rejected (e.g. the user does not exist yet). */
  @step
  async login(email: string, password: string): Promise<boolean> {
    await this.page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await this.page.getByRole('textbox', { name: 'Password', exact: true }).fill(password);
    await this.page.getByRole('button', { name: 'Sign in' }).click();
    await this.page.waitForLoadState('domcontentloaded');
    return !this.page.url().endsWith('/login');
  }
}

export class RegisterPage {
  constructor(private readonly page: Page) {}

  @step
  async register(email: string, password: string) {
    await this.page.goto('/register');
    await this.page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await this.page.getByRole('textbox', { name: 'Password', exact: true }).fill(password);
    await this.page.getByRole('textbox', { name: 'Password (again)' }).fill(password);
    // This checkbox calls haveibeenpwned.com. The suite must not depend on external services.
    await this.page.getByRole('checkbox', { name: 'Verify password security' }).uncheck();
    // WebKit under load sometimes drops this click: the form is valid, nothing is sent and the page just
    // sits there. The click is repeated only while no POST /register has left the browser, so a slow
    // server can never lead to a second registration.
    let submitted = false;
    const onRequest = (request: Request) => {
      if (request.method() === 'POST' && request.url().endsWith('/register')) submitted = true;
    };
    this.page.on('request', onRequest);
    try {
      await expect(async () => {
        if (!submitted) await this.page.getByRole('button', { name: 'Register' }).click();
        await expect(this.page).not.toHaveURL(/\/register$/, { timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
    } catch (error) {
      // Say why, not only that the URL did not change. Server errors come in an alert; the page's own
      // checks (length, match) use a plain box.
      const messages = await this.page
        .locator('[role="alert"], #client-errors')
        .filter({ visible: true })
        .allInnerTexts();
      throw new Error(
        `Registering ${email} failed (request sent: ${submitted}). The page says: ${messages.join(' | ') || '(nothing)'}`,
        { cause: error },
      );
    } finally {
      this.page.off('request', onRequest);
    }
  }
}

/** First-run wizard. Firefly redirects every page here until the user has an asset account. */
export class NewUserPage {
  constructor(private readonly page: Page) {}

  isShown() {
    return this.page.url().endsWith('/new-user');
  }

  @step
  async complete(bankName: string) {
    await this.page.getByRole('textbox', { name: 'Bank name' }).fill(bankName);
    // The 'Balance' label is not associated with its input, so there is no accessible name to target.
    await this.page.locator('input[name="bank_balance"]').fill('0');
    await this.page.getByRole('button', { name: 'Submit' }).click();
    await expect(this.page).not.toHaveURL(/\/new-user$/);
  }
}

export class TokenPage {
  constructor(private readonly page: Page) {}

  /** Creates a Personal Access Token through the UI and returns it. The UI shows it only once. */
  @step
  async createPersonalAccessToken(name: string): Promise<string> {
    // The button belongs to a Vue component, and a click before it mounts does nothing. The component
    // loads the existing tokens as soon as it mounts, so that response means the button is live.
    const mounted = this.page.waitForResponse(
      (r) => r.url().endsWith('/oauth/personal-access-tokens') && r.request().method() === 'GET',
    );
    await this.page.goto('/profile/oauth');
    await mounted;
    await this.page.getByText('Create new token', { exact: true }).last().click();
    // The modal has no accessible name, so identify it by its heading.
    const dialog = this.page
      .getByRole('dialog')
      .filter({ has: this.page.getByRole('heading', { name: 'Create token' }) });
    await dialog.getByRole('textbox').fill(name);

    const response = this.page.waitForResponse(
      (r) => r.url().endsWith('/oauth/personal-access-tokens') && r.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Create' }).click();
    const body = (await (await response).json()) as { accessToken: string };
    expect(body.accessToken).toBeTruthy();
    return body.accessToken;
  }
}
