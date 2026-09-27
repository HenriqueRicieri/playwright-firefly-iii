import { expect, type Locator, type Page } from '@playwright/test';

/** /accounts/create/asset */
export class AccountFormPage {
  readonly name: Locator;
  readonly openingBalance: Locator;
  readonly openingBalanceDate: Locator;
  readonly submitButton: Locator;
  /** Server-side validation messages shown in the error box at the top of the form. */
  readonly errors: Locator;

  constructor(private readonly page: Page) {
    this.name = page.getByRole('textbox', { name: 'Name' });
    this.openingBalance = page.getByRole('spinbutton', { name: 'Opening balance' });
    this.openingBalanceDate = page.getByRole('textbox', { name: 'Opening balance date' });
    this.submitButton = page.getByRole('button', { name: 'Store new asset account' });
    this.errors = page
      .getByRole('alert')
      .filter({ hasText: /There (is|are) \w+ errors?/ })
      .getByRole('listitem');
  }

  async goto() {
    await this.page.goto('/accounts/create/asset');
  }

  async fill(input: { name: string; openingBalance?: string; openingBalanceDate?: string }) {
    await this.name.fill(input.name);
    if (input.openingBalance !== undefined) await this.openingBalance.fill(input.openingBalance);
    if (input.openingBalanceDate !== undefined) await this.openingBalanceDate.fill(input.openingBalanceDate);
  }

  async submit() {
    await this.submitButton.click();
  }

  /** Stores the account. The redirect away from the form is the success signal. */
  async submitAndExpectStored() {
    await this.submitButton.click();
    await expect(this.page).not.toHaveURL(/\/accounts\/create\//);
  }
}
