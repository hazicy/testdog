import type { Page } from 'playwright';

export async function captureWebScreenshot(
  page: Page,
  options: Parameters<Page['screenshot']>[0] = {},
) {
  try {
    return await page.screenshot(options);
  } catch (error) {
    if (page.isClosed() || !String(error).includes('Unable to capture screenshot')) throw error;

    // Try restoring the page's capture surface without repeating the business action.
    await page.bringToFront();

    return page.screenshot(options);
  }
}
