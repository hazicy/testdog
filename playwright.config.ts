import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @testdog/web start',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      HOSTNAME: '127.0.0.1',
      PORT: '3100',
      CASEFORGE_ALLOW_UNAUTHENTICATED: 'true',
      BETTER_AUTH_URL: 'http://127.0.0.1:3100',
      BETTER_AUTH_SECRET: 'caseforge-ui-test-secret-at-least-32-characters',
    },
  },
});
