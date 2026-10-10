import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
    trace: 'retain-on-failure',
    httpCredentials: { username: 'caseforge-ui', password: 'local-ui-test' },
  },
  webServer: {
    command: 'pnpm exec next start --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      CASEFORGE_REQUIRE_AUTH: 'true',
      CASEFORGE_AUTH_USER: 'caseforge-ui',
      CASEFORGE_AUTH_PASSWORD: 'local-ui-test',
    },
  },
});
