import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../../src/fixtures';

// Automated WCAG 2 A/AA checks with axe on the screens the suite works with.
//
// Firefly III already has violations (several of them are why some page objects fall back to ids).
// They are recorded per screen in a11y-baseline.json, so this is a regression gate: a new kind of
// violation fails the test, and so does a fixed one, to keep the baseline honest.
// axe checks the DOM, which is the same in every engine, so this file runs in Chromium only (see the config).
// Regenerate the baseline with: UPDATE_A11Y_BASELINE=1 npx playwright test accessibility --project=e2e-chromium

const baselineFile = resolve(import.meta.dirname, 'a11y-baseline.json');
const updating = process.env.UPDATE_A11Y_BASELINE === '1';
const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')) as Record<string, string[]>;

const screens = {
  dashboard: '/',
  'new asset account': '/accounts/create/asset',
  'new withdrawal': '/transactions/create/withdrawal',
  budgets: '/budgets',
  profile: '/profile',
};

test.describe('Accessibility (WCAG 2 A/AA)', () => {
  // Updating writes one shared file, so do it from a single worker.
  test.describe.configure({ mode: updating ? 'serial' : 'parallel' });

  for (const [screen, path] of Object.entries(screens)) {
    test(`${screen} has no new kinds of violations`, async ({ page }, testInfo) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      await testInfo.attach('axe-results.json', {
        body: JSON.stringify(results.violations, null, 2),
        contentType: 'application/json',
      });

      const found = [...new Set(results.violations.map((v) => v.id))].sort();
      // eslint-disable-next-line playwright/no-conditional-in-test -- baseline update mode, see the top of the file
      if (updating) {
        baseline[screen] = found;
        writeFileSync(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`);
        return;
      }
      expect(found, `axe rule ids on ${path} (see the attached axe-results.json)`).toEqual(baseline[screen]);
    });
  }
});
