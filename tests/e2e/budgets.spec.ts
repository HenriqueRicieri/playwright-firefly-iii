import { test, expect } from '../../src/fixtures';
import { futureDate, pastDate, uniqueName } from '../../src/data/builders';
import { sumMoney } from '../../src/data/money';

// A report that lies is worse than no report. What is left in a budget must move by exactly what was spent.

test.describe('Budgets', () => {
  // The limit period includes "now", because the form dates new transactions with the current time.
  const start = pastDate(20);
  const end = futureDate(10);

  test('an expense linked to the budget lowers what is left by exactly its amount', async ({
    api,
    transactionForm,
  }) => {
    const budget = await api.createBudget({ name: uniqueName('Food'), limit: '500.00', start, end });
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '1000.00' });

    await transactionForm.createWithdrawal({
      description: uniqueName('Groceries'),
      from: account.name,
      to: uniqueName('Supermarket'),
      amount: '123.45',
      budget: budget.name,
    });

    const spent = await api.spentOnLimit(budget.id, budget.limitId);
    expect(sumMoney(spent)).toBe('-123.45');
    expect(sumMoney('500.00', spent)).toBe('376.55');
  });

  test('an expense without a budget does not touch it', async ({ api, transactionForm }) => {
    const budget = await api.createBudget({ name: uniqueName('Food'), limit: '500.00', start, end });
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '1000.00' });

    await transactionForm.createWithdrawal({
      description: uniqueName('Groceries'),
      from: account.name,
      to: uniqueName('Supermarket'),
      amount: '123.45',
    });

    expect(sumMoney(await api.spentOnLimit(budget.id, budget.limitId))).toBe('0.00');
  });
});
