import { test, expect } from '../../src/fixtures';
import { uniqueName } from '../../src/data/builders';

// Rules change data without anyone looking at it. That is exactly why they need tests:
// the rule must fire when it should, and only then.

test.describe('Automatic rules', () => {
  test('a matching transaction created in the UI gets the category', async ({
    api,
    categoryRule,
    transactionForm,
  }) => {
    const keyword = uniqueName('market').replace(' ', '-');
    const category = uniqueName('Groceries');
    await categoryRule({ keyword, category });
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '100.00' });

    // Upper case on purpose: the trigger matches regardless of case.
    const id = await transactionForm.createWithdrawal({
      description: `Weekly shopping ${keyword.toUpperCase()}`,
      from: account.name,
      to: uniqueName('Supermarket'),
      amount: '64.90',
    });

    expect((await api.getTransaction(id)).splits[0]!.categoryName).toBe(category);
  });

  test('a transaction that does not match is left alone', async ({ api, categoryRule, transactionForm }) => {
    const keyword = uniqueName('market').replace(' ', '-');
    await categoryRule({ keyword, category: uniqueName('Groceries') });
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '100.00' });

    const id = await transactionForm.createWithdrawal({
      description: uniqueName('Cinema tickets'),
      from: account.name,
      to: uniqueName('Cinema'),
      amount: '30.00',
    });

    expect((await api.getTransaction(id)).splits[0]!.categoryName).toBeNull();
  });

  test('unticking "Apply rules" stores the transaction without running them', async ({
    api,
    categoryRule,
    transactionForm,
  }) => {
    const keyword = uniqueName('market').replace(' ', '-');
    await categoryRule({ keyword, category: uniqueName('Groceries') });
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '100.00' });

    const id = await transactionForm.createWithdrawal({
      description: `Weekly shopping ${keyword}`,
      from: account.name,
      to: uniqueName('Supermarket'),
      amount: '64.90',
      applyRules: false,
    });

    expect((await api.getTransaction(id)).splits[0]!.categoryName).toBeNull();
  });
});
