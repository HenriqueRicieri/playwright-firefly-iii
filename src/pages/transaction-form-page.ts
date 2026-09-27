import { expect, type Locator, type Page } from '@playwright/test';
import { step } from '../step';
import type { NewSplit } from '../api/firefly-api';

type TransactionType = NewSplit['type'];

/**
 * The fields of one split. They are found by their indexed ids (`amount_0`, `amount_1`, ...) because the
 * placeholders repeat in every split, and the split tabs are named after whatever description was typed.
 */
export class SplitFields {
  readonly description: Locator;
  readonly source: Locator;
  readonly destination: Locator;
  /** Amount in the source account's currency. Its label is the currency name. */
  readonly amount: Locator;
  /** "Amount in the currency of the destination account", shown when the two currencies differ. */
  readonly foreignAmount: Locator;
  /** The budget select sits under an icon instead of a label. */
  readonly budget: Locator;

  constructor(
    private readonly page: Page,
    readonly index: number,
  ) {
    this.description = page.locator(`#description_${index}`);
    this.source = page.locator(`#source_${index}`);
    this.destination = page.locator(`#dest_${index}`);
    this.amount = page.locator(`#amount_${index}`);
    this.foreignAmount = page.locator(`#foreign_amount_${index}`);
    this.budget = page.locator(`#budget_id_${index}`);
  }

  /**
   * The inputs exist before the autocomplete is wired up, and text typed before that never opens the
   * suggestion list. The autocomplete marks the input as a combobox once it is attached.
   */
  async waitUntilReady() {
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
}

/**
 * Create and edit forms for transactions (/transactions/create/{type}, /transactions/edit/{id}).
 * Both are the same Alpine.js component. The fields of the first split are exposed directly.
 */
export class TransactionFormPage {
  readonly description: Locator;
  readonly source: Locator;
  readonly destination: Locator;
  readonly amount: Locator;
  readonly groupTitle: Locator;
  /** The running total of all splits, e.g. "Total: €50.05". */
  readonly total: Locator;
  readonly submitButton: Locator;
  readonly applyRules: Locator;
  readonly errors: Locator;
  private readonly first: SplitFields;

  constructor(private readonly page: Page) {
    this.first = new SplitFields(page, 0);
    this.description = this.first.description;
    this.source = this.first.source;
    this.destination = this.first.destination;
    this.amount = this.first.amount;
    // Rendered once per split (with a duplicated id), and only the first copy is editable.
    this.groupTitle = page
      .getByPlaceholder('Shared description for all transactions')
      .and(page.locator(':enabled'));
    // A disabled link at the end of the split tabs; its accessible role changes with the number of splits.
    this.total = page.locator('#splitTabs .nav-link.disabled');
    this.submitButton = page.getByRole('button', { name: 'Submit' });
    this.applyRules = page.getByRole('checkbox', { name: 'Apply rules' });
    this.errors = page.locator('.invalid-feedback').filter({ visible: true });
  }

  split(index: number): SplitFields {
    return new SplitFields(this.page, index);
  }

  @step
  async gotoCreate(type: TransactionType) {
    await this.page.goto(`/transactions/create/${type}`);
    await this.first.waitUntilReady();
  }

  @step
  async gotoEdit(transactionId: string) {
    await this.page.goto(`/transactions/edit/${transactionId}`);
    await this.first.waitUntilReady();
    await expect(this.amount).not.toHaveValue('');
  }

  /** Adds a split and switches to its tab. Returns its fields. */
  @step
  async addSplit(): Promise<SplitFields> {
    const count = await this.page.locator('[id^="amount_"]').count();
    await this.page.getByRole('button', { name: 'Add another split' }).click();
    const split = this.split(count);
    await this.showSplit(count);
    await split.waitUntilReady();
    return split;
  }

  /** Only the selected split's fields are visible. The group title lives in the first one. */
  @step
  async showSplit(index: number) {
    await this.page.getByRole('tab').nth(index).click();
  }

  @step
  async selectAccount(field: 'source' | 'destination', accountName: string) {
    await this.first.selectAccount(field, accountName);
  }

  @step
  async typeAccount(field: 'source' | 'destination', accountName: string) {
    await this.first.typeAccount(field, accountName);
  }

  @step
  async fillAmount(amount: string) {
    await this.amount.fill(amount);
  }

  /** Submits and returns the transaction group id taken from the page Firefly redirects to. */
  @step
  async submitAndGetId(): Promise<string> {
    await this.submitButton.click();
    await expect(this.page).toHaveURL(/\/transactions\/show\/\d+/);
    return /\/transactions\/show\/(\d+)/.exec(this.page.url())![1]!;
  }

  // Convenience flows for the three basic types.

  @step
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
    if (input.budget !== undefined) await this.first.budget.selectOption({ label: input.budget });
    return this.submitAndGetId();
  }

  @step
  async createDeposit(input: { description: string; from: string; to: string; amount: string }) {
    await this.gotoCreate('deposit');
    await this.description.fill(input.description);
    await this.typeAccount('source', input.from);
    await this.selectAccount('destination', input.to);
    await this.fillAmount(input.amount);
    return this.submitAndGetId();
  }

  /** `foreignAmount` is what arrives in the destination account when its currency differs. */
  @step
  async createTransfer(input: {
    description: string;
    from: string;
    to: string;
    amount: string;
    foreignAmount?: string;
  }) {
    await this.gotoCreate('transfer');
    await this.description.fill(input.description);
    await this.selectAccount('source', input.from);
    await this.selectAccount('destination', input.to);
    await this.fillAmount(input.amount);
    if (input.foreignAmount !== undefined) await this.first.foreignAmount.fill(input.foreignAmount);
    return this.submitAndGetId();
  }
}

/** /transactions/delete/{id} */
export class TransactionDeletePage {
  constructor(private readonly page: Page) {}

  @step
  async delete(transactionId: string) {
    await this.page.goto(`/transactions/delete/${transactionId}`);
    await this.page.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(this.page).not.toHaveURL(/\/transactions\/delete\//);
  }
}
