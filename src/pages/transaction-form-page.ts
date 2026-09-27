import { expect, type Locator, type Page } from '@playwright/test';
import type { NewSplit } from '../api/firefly-api';

type TransactionType = NewSplit['type'];

/**
 * Create and edit forms for transactions (/transactions/create/{type}, /transactions/edit/{id}).
 * Both are the same Alpine.js component. Only the first split is supported.
 */
export class TransactionFormPage {
  readonly description: Locator;
  readonly source: Locator;
  readonly destination: Locator;
  /** No accessible name: its label is the currency name and the foreign amount shares the placeholder. */
  readonly amount: Locator;
  readonly submitButton: Locator;
  readonly applyRules: Locator;
  /** No accessible name: the budget select sits under an icon instead of a label. */
  readonly budget: Locator;
  readonly errors: Locator;

  constructor(private readonly page: Page) {
    this.description = page.getByPlaceholder('Description');
    this.source = page.getByPlaceholder('Source account');
    this.destination = page.getByPlaceholder('Destination account');
    this.amount = page.locator('#amount_0');
    this.submitButton = page.getByRole('button', { name: 'Submit' });
    this.applyRules = page.getByRole('checkbox', { name: 'Apply rules' });
    this.budget = page.locator('#budget_id_0');
    this.errors = page.locator('.invalid-feedback').filter({ visible: true });
  }

  async gotoCreate(type: TransactionType) {
    await this.page.goto(`/transactions/create/${type}`);
    await this.waitUntilReady();
  }

  async gotoEdit(transactionId: string) {
    await this.page.goto(`/transactions/edit/${transactionId}`);
    await this.waitUntilReady();
    await expect(this.amount).not.toHaveValue('');
  }

  /**
   * The inputs exist before the autocomplete is wired up, and text typed before that never opens the
   * suggestion list. The autocomplete marks the input as a combobox once it is attached.
   */
  private async waitUntilReady() {
    await expect(this.source).toHaveAttribute('role', 'combobox');
    await expect(this.destination).toHaveAttribute('role', 'combobox');
  }

  /** Picks an existing account from the autocomplete (needed for asset accounts). */
  async selectAccount(field: 'source' | 'destination', accountName: string) {
    await this[field].fill(accountName);
    await this.page.getByRole('menuitem', { name: `${accountName} (` }).click();
  }

  /** Types a free-text name. Firefly creates the expense/revenue account if it does not exist. */
  async typeAccount(field: 'source' | 'destination', accountName: string) {
    await this[field].fill(accountName);
  }

  async fillAmount(amount: string) {
    await this.amount.fill(amount);
  }

  /** Submits and returns the transaction group id taken from the page Firefly redirects to. */
  async submitAndGetId(): Promise<string> {
    await this.submitButton.click();
    await expect(this.page).toHaveURL(/\/transactions\/show\/\d+/);
    return /\/transactions\/show\/(\d+)/.exec(this.page.url())![1]!;
  }

  // Convenience flows for the three basic types.

  async createWithdrawal(input: {
    description: string;
    from: string;
    to: string;
    amount: string;
    applyRules?: boolean;
    budget?: string;
  }) {
    await this.gotoCreate('withdrawal');
    await this.description.fill(input.description);
    await this.selectAccount('source', input.from);
    await this.typeAccount('destination', input.to);
    await this.fillAmount(input.amount);
    if (input.applyRules !== undefined) await this.applyRules.setChecked(input.applyRules);
    if (input.budget !== undefined) await this.budget.selectOption({ label: input.budget });
    return this.submitAndGetId();
  }

  async createDeposit(input: { description: string; from: string; to: string; amount: string }) {
    await this.gotoCreate('deposit');
    await this.description.fill(input.description);
    await this.typeAccount('source', input.from);
    await this.selectAccount('destination', input.to);
    await this.fillAmount(input.amount);
    return this.submitAndGetId();
  }

  async createTransfer(input: { description: string; from: string; to: string; amount: string }) {
    await this.gotoCreate('transfer');
    await this.description.fill(input.description);
    await this.selectAccount('source', input.from);
    await this.selectAccount('destination', input.to);
    await this.fillAmount(input.amount);
    return this.submitAndGetId();
  }
}

/** /transactions/delete/{id} */
export class TransactionDeletePage {
  constructor(private readonly page: Page) {}

  async delete(transactionId: string) {
    await this.page.goto(`/transactions/delete/${transactionId}`);
    await this.page.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(this.page).not.toHaveURL(/\/transactions\/delete\//);
  }
}
