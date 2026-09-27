import { test, expect } from '../../src/fixtures';
import { uniqueName } from '../../src/data/builders';

// Classic finance bugs live here: the smallest unit, very large numbers, rounding, and signs.
// Where Firefly's behavior is a design choice rather than a bug, the test documents what it does.

test.describe('Amounts', () => {
  test('one cent is not lost', async ({ api, transactionForm }) => {
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '100.00' });

    await transactionForm.createWithdrawal({
      description: uniqueName('Penny'),
      from: account.name,
      to: uniqueName('Jar'),
      amount: '0.01',
    });

    expect(await api.balanceOf(account.id)).toBe('99.99');
  });

  test('large amounts keep every digit', async ({ api, transactionForm }) => {
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '0.01' });

    await transactionForm.createDeposit({
      description: uniqueName('Property sale'),
      from: uniqueName('Buyer'),
      to: account.name,
      amount: '98765432.19',
    });

    expect(await api.balanceOf(account.id)).toBe('98765432.20');
  });

  for (const amount of ['0', '-5.00']) {
    test(`amount ${amount} is rejected and the balance does not change`, async ({ api, transactionForm }) => {
      const account = await api.createAssetAccount({
        name: uniqueName('Checking'),
        openingBalance: '100.00',
      });

      await transactionForm.gotoCreate('withdrawal');
      await transactionForm.description.fill(uniqueName('Invalid'));
      await transactionForm.selectAccount('source', account.name);
      await transactionForm.typeAccount('destination', uniqueName('Shop'));
      await transactionForm.fillAmount(amount);
      await transactionForm.submitButton.click();

      await expect(transactionForm.errors).toHaveText(['The value must be more than zero.']);
      expect(await api.balanceOf(account.id)).toBe('100.00');
    });
  }

  test('sub-cent amounts are stored in full and only the balance is rounded', async ({
    api,
    transactionForm,
  }) => {
    // EUR has 2 decimals, but the form accepts 3. Firefly keeps the exact amount.
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '100.00' });

    const id = await transactionForm.createWithdrawal({
      description: uniqueName('Fuel'),
      from: account.name,
      to: uniqueName('Gas station'),
      amount: '10.999',
    });

    expect((await api.getTransaction(id)).splits[0]!.amount).toBe('10.999000000000');
    expect(await api.balanceOf(account.id)).toBe('89.00'); // 89.001
  });

  test('rounding happens on the total, not per transaction', async ({ api }) => {
    // Three withdrawals of 0.004 tell the strategies apart:
    //   rounding each transaction -> 100.00, truncating the total -> 99.98, rounding the total -> 99.99
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '100.00' });
    for (let i = 1; i <= 3; i++) {
      await api.createTransaction({
        type: 'withdrawal',
        description: uniqueName(`Fee ${i}`),
        amount: '0.004',
        sourceId: account.id,
        destinationName: 'Bank fees',
      });
    }

    expect(await api.balanceOf(account.id)).toBe('99.99'); // 99.988
  });
});
