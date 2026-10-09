import { errors, type Page } from 'playwright';

// Like tester-army/e2e's observation capture, settling is best-effort.
// It must leave time to read live pages with polling or continuously changing DOM.
const settleTimeoutMs = 5000;

export async function waitForObservationReady(page: Page, timeout = settleTimeoutMs) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: Math.max(1, timeout) });
  } catch (error) {
    if (!(error instanceof errors.TimeoutError)) throw error;
  }
}
