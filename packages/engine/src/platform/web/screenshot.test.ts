import type { Page } from 'playwright';
import { expect, it, vi } from 'vitest';
import { captureWebScreenshot } from '@testdog/engine/platform/web/screenshot';

const protocolError = new Error('Page.captureScreenshot: Unable to capture screenshot');

function fixture() {
  const page = {
    screenshot: vi.fn().mockResolvedValue(Buffer.from('image')),
    bringToFront: vi.fn().mockResolvedValue(undefined),
    isClosed: vi.fn(() => false),
  };

  return { page, browserPage: page as unknown as Page };
}

it('activates the page and retries a protocol failure once with the same screenshot options', async () => {
  const { page, browserPage } = fixture();
  const options = { type: 'jpeg' as const, quality: 72, timeout: 3000 };

  page.screenshot.mockRejectedValueOnce(protocolError);
  await expect(captureWebScreenshot(browserPage, options)).resolves.toEqual(Buffer.from('image'));
  expect(page.bringToFront).toHaveBeenCalledOnce();
  expect(page.screenshot.mock.calls).toEqual([[options], [options]]);
  expect(page.bringToFront.mock.invocationCallOrder[0]).toBeGreaterThan(
    page.screenshot.mock.invocationCallOrder[0],
  );
  expect(page.bringToFront.mock.invocationCallOrder[0]).toBeLessThan(
    page.screenshot.mock.invocationCallOrder[1],
  );
});

it('propagates persistent capture failures after one retry', async () => {
  const { page, browserPage } = fixture();

  page.screenshot.mockRejectedValue(protocolError);
  await expect(captureWebScreenshot(browserPage)).rejects.toBe(protocolError);
  expect(page.screenshot).toHaveBeenCalledTimes(2);
});

it.each([false, true])(
  'does not retry unrelated errors or closed pages (closed: %s)',
  async (closed) => {
    const { page, browserPage } = fixture();
    const error = closed ? protocolError : new Error('screenshot timed out');

    page.isClosed.mockReturnValue(closed);
    page.screenshot.mockRejectedValue(error);
    await expect(captureWebScreenshot(browserPage)).rejects.toBe(error);
    expect(page.screenshot).toHaveBeenCalledOnce();
    expect(page.bringToFront).not.toHaveBeenCalled();
  },
);
