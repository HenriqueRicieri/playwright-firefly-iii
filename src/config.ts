import { randomUUID } from 'node:crypto';

// Test-only defaults for the disposable Docker instance. Override with env vars if needed.
const password = process.env.FIREFLY_PASSWORD ?? 'Test-only-pass-123!';

export const config = {
  baseURL: process.env.FIREFLY_URL ?? 'http://localhost:8080',
  /** First user of the instance. Firefly makes it the administrator. */
  admin: { email: process.env.FIREFLY_ADMIN ?? 'admin@example.com', password },
  /**
   * A brand-new user for each worker in each run, so tests in different workers never share data or a
   * session, and every run starts clean even against a reused local instance.
   */
  newWorkerUser: (workerIndex: number) => ({
    email: `qa-w${workerIndex}-${randomUUID().slice(0, 8)}@example.com`,
    password,
  }),
} as const;
