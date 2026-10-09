import { chromium } from 'playwright';

export function launchBrowser() {
  return chromium.launch({
    headless: process.env.AUTOMATION_HEADLESS === 'true',
  });
}
