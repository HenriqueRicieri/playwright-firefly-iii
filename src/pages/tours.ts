import { expect, type Page } from '@playwright/test';

/**
 * Pages that show a guided tour on first visit (top-level keys of config/intro.php in Firefly 6.7.4).
 * A tour overlay blocks clicks, and closing it returns focus to the previously focused field, which can
 * send the next keystrokes to the wrong input. So the suite marks every tour as seen up front.
 */
const TOUR_KEYS = [
  'index',
  'accounts_create',
  'accounts_create_asset',
  'transactions_create',
  'transactions_create_withdrawal',
  'transactions_create_deposit',
  'transactions_create_transfer',
  'budgets_index',
  'reports_index',
  'reports_report_default',
  'reports_report_audit',
  'reports_report_category',
  'reports_report_tag',
  'reports_report_budget',
  'piggy-banks_index',
  'piggy-banks_create',
  'piggy-banks_show',
  'bills_index',
  'bills_create',
  'bills_show',
  'rules_index',
  'rules_create',
  'preferences_index',
  'currencies_index',
  'currencies_create',
];

/** Uses the same endpoint the tour's close button calls. Needs a logged-in page (for the CSRF token). */
export async function markAllToursAsSeen(page: Page) {
  const csrf = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  expect(csrf, 'CSRF token meta tag').toBeTruthy();
  for (const key of TOUR_KEYS) {
    const response = await page.request.post(`/json/intro/finished/${key}`, {
      headers: { 'X-CSRF-TOKEN': csrf!, Accept: 'application/json' },
    });
    expect(response.status(), `marking tour "${key}" as seen`).toBe(200);
  }
}
