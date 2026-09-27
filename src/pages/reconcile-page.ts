import { expect, type Locator, type Page } from '@playwright/test';
import { step } from '../step';

/** /accounts/reconcile/{id}/index/{start}/{end}: compare the ledger with a bank statement. */
export class ReconcilePage {
  /** The balance inputs have no label (the column header is not linked), so they are found by name. */
  readonly startBalance: Locator;
  readonly endBalance: Locator;
  readonly overview: Locator;

  constructor(private readonly page: Page) {
    this.startBalance = page.locator('input[name="start_balance"]');
    this.endBalance = page.locator('input[name="end_balance"]');
    this.overview = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Overview of reconciliation' }) });
  }

  @step
  async goto(accountId: string, start: string, end: string) {
    await this.page.goto(`/accounts/reconcile/${accountId}/index/${start}/${end}`);
  }

  /** Types the statement's closing balance and loads the transactions of the period. */
  @step
  async start(statementEndBalance: string) {
    await this.endBalance.fill(statementEndBalance);
    await this.page.getByRole('link', { name: 'Start reconciling' }).click();
  }

  /** Ticks a transaction as present on the statement. */
  @step
  async tick(description: string) {
    await this.page.getByRole('row', { name: description }).getByRole('checkbox').check();
  }

  /** Opens the overview dialog that summarizes the reconciliation before it is stored. */
  @step
  async review() {
    await this.page.getByRole('button', { name: 'Store reconciliation' }).click();
    await expect(this.overview).toBeVisible();
  }

  /** A value from the overview table, e.g. overviewValue('Difference') -> "€0.75". */
  overviewValue(label: string): Locator {
    return this.overview.getByRole('row', { name: label }).getByRole('cell').last();
  }

  @step
  async confirm(options: { createCorrection: boolean }) {
    if (options.createCorrection) {
      await this.overview.getByRole('radio', { name: /create a correction/ }).check();
    }
    await this.overview.getByRole('button', { name: 'Confirm reconciliation' }).click();
    // Firefly redirects to the account page once the reconciliation is stored.
    await expect(this.page).toHaveURL(/\/accounts\/show\/\d+/);
  }
}
