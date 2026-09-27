// Test-only defaults for the disposable Docker instance. Override with env vars if needed.
export const config = {
  baseURL: process.env.FIREFLY_URL ?? 'http://localhost:8080',
  user: {
    email: process.env.FIREFLY_USER ?? 'qa@example.com',
    password: process.env.FIREFLY_PASSWORD ?? 'Test-only-pass-123!',
  },
  storageStatePath: '.auth/user.json',
  tokenPath: '.auth/token.json',
} as const;
