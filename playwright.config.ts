import { defineConfig, devices } from '@playwright/test';
import { config } from './src/config';

export default defineConfig({
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  fullyParallel: true,
  // In CI every browser runs in its own job and writes a blob report; a final job merges them into one HTML report.
  reporter: process.env.CI ? [['blob'], ['github'], ['list']] : [['html', { open: 'never' }], ['list']],
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
    // Each worker registers its own user and session (see src/fixtures).
    {
      name: 'e2e-chromium',
      testDir: 'tests/e2e',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'e2e-firefox',
      testDir: 'tests/e2e',
      dependencies: ['setup'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'e2e-webkit',
      testDir: 'tests/e2e',
      dependencies: ['setup'],
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
