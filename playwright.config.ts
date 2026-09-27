import { defineConfig, devices } from '@playwright/test';
import { config } from './src/config';

export default defineConfig({
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  fullyParallel: true,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github'], ['list']]
    : [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: config.baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Same time zone as the app container (docker/firefly.env), so 'now' in the browser is 'now' on the server.
    timezoneId: 'America/Sao_Paulo',
    locale: 'en-US',
  },
  projects: [
    // Tests of the suite's own helpers. No browser, no Firefly.
    { name: 'unit', testDir: 'tests/unit' },
    { name: 'setup', testDir: 'tests/setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'api',
      testDir: 'tests/api',
      dependencies: ['setup'],
    },
    {
      name: 'e2e',
      testDir: 'tests/e2e',
      dependencies: ['setup'],
      // Each worker logs in once and gets its own session (see src/fixtures).
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
