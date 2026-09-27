import { test, expect } from '../../src/fixtures';
import { pastDate, uniqueName } from '../../src/data/builders';

// The API is not only a shortcut for test setup. It is a product surface with its own contract.

test.describe('Authentication', () => {
  test('request without a token is rejected with 401', async ({ request }) => {
    const response = await request.get('/api/v1/accounts', { headers: { Accept: 'application/json' } });

    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ message: 'Unauthenticated.' });
  });

  test('request with an invalid token is rejected with 401', async ({ request }) => {
    const response = await request.get('/api/v1/accounts', {
      headers: { Accept: 'application/json', Authorization: 'Bearer not-a-real-token' },
    });

    expect(response.status()).toBe(401);
  });
});

test.describe('Validation', () => {
  test('transaction without amount returns 422 naming the field', async ({ api }) => {
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '100.00' });

    const response = await api.request.post('/api/v1/transactions', {
      data: {
        transactions: [
          {
            type: 'withdrawal',
            date: pastDate(),
            description: uniqueName('No amount'),
            source_id: account.id,
            destination_name: 'Shop',
          },
        ],
      },
    });

    expect(response.status()).toBe(422);
    expect((await response.json()).errors).toEqual({
      'transactions.0.amount': ['The transaction amount field is required.'],
    });
  });

  test('amount with a decimal comma is rejected, not misread', async ({ api }) => {
    // "10,50" must never become 1050 or 10. Rejecting it is the safe outcome.
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '100.00' });

    const response = await api.request.post('/api/v1/transactions', {
      data: {
        transactions: [
          {
            type: 'withdrawal',
            date: pastDate(),
            amount: '10,50',
            description: uniqueName('Comma'),
            source_id: account.id,
            destination_name: 'Shop',
          },
        ],
      },
    });

    expect(response.status()).toBe(422);
    expect((await response.json()).errors).toEqual({
      'transactions.0.amount': ['The transaction amount must be a number.'],
    });
    expect(await api.balanceOf(account.id)).toBe('100.00');
  });

  test('asset account without name and role returns 422 for both fields', async ({ api }) => {
    const response = await api.request.post('/api/v1/accounts', { data: { type: 'asset' } });

    expect(response.status()).toBe(422);
    expect((await response.json()).errors).toEqual({
      name: ['The name field is required.'],
      account_role: ['The account role field is required when type is asset.'],
    });
  });
});

test.describe('Round trip', () => {
  test('what is stored is what comes back', async ({ api }) => {
    const account = await api.createAssetAccount({ name: uniqueName('Checking'), openingBalance: '100.00' });
    const input = {
      type: 'withdrawal' as const,
      description: uniqueName('Round trip'),
      amount: '42.42',
      sourceId: account.id,
      destinationName: uniqueName('Bookstore'),
    };

    const created = await api.createTransaction(input);
    const fetched = await api.getTransaction(created.id);

    expect(fetched).toEqual(created);
    expect(fetched.splits).toHaveLength(1);
    expect(fetched.splits[0]).toMatchObject({
      type: 'withdrawal',
      description: input.description,
      amount: '42.420000000000',
      sourceId: account.id,
      sourceName: account.name,
      destinationName: input.destinationName,
    });
  });
});
