import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  testMatch: 'mobile.e2e.ts',
  projects: [
    { name: 'mobile-chromium', use: { browserName: 'chromium' } },
    { name: 'mobile-webkit', use: { browserName: 'webkit' } },
  ],
});
