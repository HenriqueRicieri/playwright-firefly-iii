import { test, expect } from '../../src/fixtures';
import { pastDate, uniqueName } from '../../src/data/builders';
import type { FireflyApi } from '../../src/api/firefly-api';

// Reconciling is checking the ledger against the bank statement, line by line. When they disagree,
// the system must record the difference explicitly instead of letting the two drift apart.

// The whole period is in the past: a correction dated in the future would not count towards the
// current balance, and the test would be checking the calendar instead of the reconciliation.
const periodStart = pastDate(20);
const periodEnd = pastDate(2);

/** Account with 1000.00 before the period and three withdrawals inside it: balance 829.75. */
async function accountWithStatementPeriod(api: FireflyApi) {
  const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '1000.00' });
  const descriptions: string[] = [];
  for (const [daysAgo, amount] of [
    [15, '100.00'],
    [10, '50.25'],
    [5, '20.00'],
  ] as const) {
    const description = uniqueName(`Card ${amount}`);
    descriptions.push(description);
    await api.createTransaction({
      type: 'withdrawal',
      description,
      amount,
      date: pastDate(daysAgo),
      sourceId: account.id,
      destinationName: 'Card purchases',
    });
  }
  expect(await api.balanceOf(account.id)).toBe('829.75');
  return { account, descriptions };
}

test.describe('Reconciliation', () => {
  test('statement matches the ledger: transactions are cleared, nothing is added', async ({
    api,
    reconcilePage,
  }) => {
    const { account, descriptions } = await accountWithStatementPeriod(api);

    await reconcilePage.goto(account.id, periodStart, periodEnd);
    await expect(reconcilePage.startBalance).toHaveValue('1000.00');
    await reconcilePage.start('829.75');
    for (const description of descriptions) await reconcilePage.tick(description);
    await reconcilePage.review();

    await expect(reconcilePage.overviewValue('Selected transactions (3)')).toHaveText('-€170.25');
    await expect(reconcilePage.overviewValue('Difference')).toHaveText('€0.00');
    await reconcilePage.confirm({ createCorrection: false });

    const splits = await api.splitsOf(account.id);
    expect(splits.filter((s) => s.type === 'reconciliation')).toEqual([]);
    expect(splits.filter((s) => descriptions.includes(s.description)).map((s) => s.reconciled)).toEqual([
      true,
      true,
      true,
    ]);
    expect(await api.balanceOf(account.id)).toBe('829.75');
  });

  test('bank shows less money: the correction brings the ledger to the statement', async ({
    api,
    reconcilePage,
  }) => {
    // The statement has an 0.75 fee that nobody recorded.
    const { account, descriptions } = await accountWithStatementPeriod(api);

    await reconcilePage.goto(account.id, periodStart, periodEnd);
    await reconcilePage.start('829.00');
    for (const description of descriptions) await reconcilePage.tick(description);
    await reconcilePage.review();

    await expect(reconcilePage.overviewValue('Difference')).toHaveText('€0.75');
    await reconcilePage.confirm({ createCorrection: true });

    const corrections = (await api.splitsOf(account.id)).filter((s) => s.type === 'reconciliation');
    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      amount: '0.750000000000',
      sourceId: account.id,
      reconciled: true,
    });
    expect(corrections[0]!.date.slice(0, 10)).toBe(periodEnd);
    expect(await api.balanceOf(account.id)).toBe('829.00');
  });

  test('a transaction left unticked stays open and shows up in the difference', async ({
    api,
    reconcilePage,
  }) => {
    // The 20.00 purchase is not on this statement yet (it will clear next month).
    const { account, descriptions } = await accountWithStatementPeriod(api);
    const [first, second, notOnStatement] = descriptions as [string, string, string];

    await reconcilePage.goto(account.id, periodStart, periodEnd);
    await reconcilePage.start('849.75');
    await reconcilePage.tick(first);
    await reconcilePage.tick(second);
    await reconcilePage.review();

    await expect(reconcilePage.overviewValue('Selected transactions (2)')).toHaveText('-€150.25');
    await expect(reconcilePage.overviewValue('Difference')).toHaveText('€0.00');
    await reconcilePage.confirm({ createCorrection: false });

    const byDescription = new Map((await api.splitsOf(account.id)).map((s) => [s.description, s]));
    expect(byDescription.get(first)!.reconciled).toBe(true);
    expect(byDescription.get(second)!.reconciled).toBe(true);
    expect(byDescription.get(notOnStatement)!.reconciled).toBe(false);
    expect(await api.balanceOf(account.id)).toBe('829.75');
  });
});
