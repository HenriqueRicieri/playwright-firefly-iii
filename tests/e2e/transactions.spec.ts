import { test, expect } from '../../src/fixtures';
import { uniqueName } from '../../src/data/builders';
import { sumMoney } from '../../src/data/money';

// The core of a ledger: money leaves one place and arrives in another, and not a cent more or less.
// Pattern: arrange through the API, act through the UI, assert through the API.

test.describe('Transactions and balances', () => {
  test('a withdrawal lowers the balance by exactly its amount', async ({ api, transactionForm }) => {
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '500.00' });

    await transactionForm.createWithdrawal({
      description: uniqueName('Groceries'),
      from: account.name,
      to: uniqueName('Supermarket'),
      amount: '123.45',
    });

    expect(await api.balanceOf(account.id)).toBe('376.55');
  });

  test('a deposit raises the balance by exactly its amount', async ({ api, transactionForm }) => {
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '500.00' });

    await transactionForm.createDeposit({
      description: uniqueName('Salary'),
      from: uniqueName('Employer'),
      to: account.name,
      amount: '2345.67',
    });

    expect(await api.balanceOf(account.id)).toBe('2845.67');
  });

  test('a transfer moves money without creating or losing any', async ({ api, transactionForm }) => {
    const checking = await api.createAssetAccount({
      name: uniqueName('Checking'),
      openingBalance: '1000.00',
    });
    const savings = await api.createAssetAccount({ name: uniqueName('Savings'), openingBalance: '250.10' });
    const totalBefore = sumMoney(checking.currentBalance, savings.currentBalance);

    await transactionForm.createTransfer({
      description: uniqueName('Move to savings'),
      from: checking.name,
      to: savings.name,
      amount: '300.33',
    });

    const [checkingAfter, savingsAfter] = await Promise.all([
      api.balanceOf(checking.id),
      api.balanceOf(savings.id),
    ]);
    expect(checkingAfter).toBe('699.67');
    expect(savingsAfter).toBe('550.43');
    expect(sumMoney(checkingAfter, savingsAfter)).toBe(totalBefore);
  });

  test('editing the amount recalculates the balance', async ({ api, transactionForm }) => {
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '500.00' });
    const transaction = await api.createTransaction({
      type: 'withdrawal',
      description: uniqueName('Pharmacy'),
      amount: '40.00',
      sourceId: account.id,
      destinationName: uniqueName('Drugstore'),
    });
    expect(await api.balanceOf(account.id)).toBe('460.00');

    await transactionForm.gotoEdit(transaction.id);
    await transactionForm.fillAmount('45.99');
    await transactionForm.submitAndGetId();

    expect(await api.balanceOf(account.id)).toBe('454.01');
  });

  test('deleting a transaction puts the balance back', async ({ api, transactionDelete }) => {
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '500.00' });
    const transaction = await api.createTransaction({
      type: 'withdrawal',
      description: uniqueName('Restaurant'),
      amount: '87.30',
      sourceId: account.id,
      destinationName: uniqueName('Bistro'),
    });
    expect(await api.balanceOf(account.id)).toBe('412.70');

    await transactionDelete.delete(transaction.id);

    expect(await api.transactionStatus(transaction.id)).toBe(404);
    expect(await api.balanceOf(account.id)).toBe('500.00');
  });
});
