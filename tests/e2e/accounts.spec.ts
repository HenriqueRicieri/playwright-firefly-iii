import { test, expect } from '../../src/fixtures';
import { pastDate, uniqueName } from '../../src/data/builders';

// Every balance starts from the opening balance. If that is stored wrong, every number after it is wrong.

test.describe('Asset accounts', () => {
  test('opening balance typed in the UI is what the API reports', async ({ accountForm, api }) => {
    const name = uniqueName('Checking');

    await accountForm.goto();
    await accountForm.fill({ name, openingBalance: '1250.75', openingBalanceDate: pastDate(10) });
    await accountForm.submit();

    await expect(accountForm.successMessage).toContainText(`New account "${name}" stored!`);
    const account = await api.findAssetAccountByName(name);
    expect(account.currentBalance).toBe('1250.75');
    expect(account.openingBalance).toBe('1250.75');
  });

  test('name is required', async ({ accountForm }) => {
    await accountForm.goto();
    await accountForm.fill({ name: '', openingBalance: '10.00', openingBalanceDate: pastDate(10) });
    await accountForm.submit();

    await expect(accountForm.errors).toHaveText(['The name field is required.']);
  });

  test('opening balance field does not accept letters', async ({ accountForm }) => {
    await accountForm.goto();
    // A number input ignores non-numeric keystrokes, so nothing invalid can reach the server from here.
    await accountForm.openingBalance.pressSequentially('abc');

    await expect(accountForm.openingBalance).toHaveValue('');
  });
});
