import { test, expect } from '../../src/fixtures';

test('logged-in user lands on the dashboard', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Logout' }).first()).toBeVisible();
});
