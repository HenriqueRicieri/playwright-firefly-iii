import { test, expect } from '../../src/fixtures';
import { uniqueName } from '../../src/data/builders';
import { money, sumMoney } from '../../src/data/money';
import { parseBody } from '../../src/api/firefly-api';
import { ValidationError } from '../../src/api/schemas';

// One receipt, several purposes: the parts must add up to exactly what left the account.
// Two currencies in one transfer: each side must move by exactly its own amount, with no conversion guessed.

test.describe('Split transactions', () => {
  test('parts entered in the UI add up to the total that leaves the account', async ({
    api,
    transactionForm,
  }) => {
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '200.00' });
    const shop = uniqueName('Supermarket');
    const parts = [
      { description: uniqueName('Food'), amount: '30.10' },
      { description: uniqueName('Cleaning'), amount: '19.95' },
    ];

    await transactionForm.gotoCreate('withdrawal');
    const first = transactionForm.split(0);
    await first.description.fill(parts[0]!.description);
    await first.selectAccount('source', account.name);
    await first.typeAccount('destination', shop);
    await first.amount.fill(parts[0]!.amount);

    const second = await transactionForm.addSplit();
    await second.description.fill(parts[1]!.description);
    await second.typeAccount('destination', shop);
    await second.amount.fill(parts[1]!.amount);

    await transactionForm.showSplit(0);
    await transactionForm.groupTitle.fill(uniqueName('Weekly shopping'));
    await expect(transactionForm.total).toHaveText('Total: €50.05');
    const id = await transactionForm.submitAndGetId();

    const stored = await api.getTransaction(id);
    expect(stored.splits.map((s) => [s.description, money(s.amount)]).sort()).toEqual(
      parts.map((p) => [p.description, p.amount]).sort(),
    );
    expect(sumMoney(...stored.splits.map((s) => s.amount))).toBe('50.05');
    expect(await api.balanceOf(account.id)).toBe('149.95');
  });

  test('a split created through the API keeps every part', async ({ api }) => {
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '200.00' });
    const amounts = ['0.01', '33.33', '66.66'];

    const transaction = await api.createSplitTransaction({
      groupTitle: uniqueName('Three parts'),
      splits: amounts.map((amount, i) => ({
        type: 'withdrawal' as const,
        description: uniqueName(`Part ${i + 1}`),
        amount,
        sourceId: account.id,
        destinationName: 'Store',
      })),
    });

    expect(transaction.splits).toHaveLength(3);
    expect(sumMoney(...transaction.splits.map((s) => s.amount))).toBe('100.00');
    expect(await api.balanceOf(account.id)).toBe('100.00');
  });
});

test.describe('Multiple currencies', () => {
  test('a transfer from EUR to USD moves each side by its own amount', async ({ api, transactionForm }) => {
    await api.enableCurrency('USD');
    const euros = await api.createAssetAccount({
      name: uniqueName('EUR account'),
      openingBalance: '1000.00',
    });
    const dollars = await api.createAssetAccount({
      name: uniqueName('USD account'),
      openingBalance: '50.00',
      currencyCode: 'USD',
    });

    const id = await transactionForm.createTransfer({
      description: uniqueName('Currency exchange'),
      from: euros.name,
      to: dollars.name,
      amount: '100.00',
      foreignAmount: '108.37',
    });

    expect(await api.balanceOf(euros.id)).toBe('900.00');
    expect(await api.balanceOf(dollars.id)).toBe('158.37');
    expect((await api.getTransaction(id)).splits[0]).toMatchObject({
      currencyCode: 'EUR',
      amount: '100.000000000000',
      foreignCurrencyCode: 'USD',
      foreignAmount: '108.370000000000',
    });
  });

  test('a transfer between currencies without the destination amount is rejected', async ({ api }) => {
    await api.enableCurrency('USD');
    const euros = await api.createAssetAccount({
      name: uniqueName('EUR account'),
      openingBalance: '1000.00',
    });
    const dollars = await api.createAssetAccount({ name: uniqueName('USD account'), currencyCode: 'USD' });

    const response = await api.postTransaction({
      splits: [
        {
          type: 'transfer',
          description: uniqueName('No rate'),
          amount: '100.00',
          sourceId: euros.id,
          destinationId: dollars.id,
        },
      ],
    });

    // Firefly will not guess an exchange rate. The message is odd for a missing field, but the outcome
    // is the safe one: nothing is stored.
    expect(response.status()).toBe(422);
    expect((await parseBody(response, ValidationError)).errors).toEqual({
      'transactions.0.foreign_amount': ['This field requires a number'],
    });
    expect(await api.balanceOf(euros.id)).toBe('1000.00');
  });

  test('known bug: an account in a disabled currency breaks the transfer form', async ({
    api,
    transactionForm,
    pageErrors,
  }) => {
    test.info().annotations.push({
      type: 'known bug',
      description:
        'Firefly III 6.7.4. The API creates an asset account in a currency that is disabled for the user. ' +
        'The transfer form then throws "Cannot read properties of undefined (reading code)" and Submit ' +
        'stays on "storing your transaction" forever, with no error shown.',
    });
    // Expected to fail until Firefly fixes it. If this starts passing, Playwright reports it, and the
    // workaround in the test above (enabling the currency first) can go.
    test.fail();

    const euros = await api.createAssetAccount({
      name: uniqueName('EUR account'),
      openingBalance: '1000.00',
    });
    // Enabling a currency lasts for the whole user, and the tests above enable USD for this worker's user.
    // No test ever enables CHF, so it is always disabled here.
    const francs = await api.createAssetAccount({ name: uniqueName('CHF account'), currencyCode: 'CHF' });

    await transactionForm.gotoCreate('transfer');
    await transactionForm.description.fill(uniqueName('Currency exchange'));
    await transactionForm.selectAccount('source', euros.name);
    await transactionForm.selectAccount('destination', francs.name);

    // Fails fast here instead of waiting for a submit that never finishes.
    expect(pageErrors.map((e) => e.message)).toEqual([]);
  });
});
