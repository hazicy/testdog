import { chromium, type Browser } from 'playwright';
import type { BrowserlessConfig } from '@testdog/contracts/automation/platform/web/providers/browserlessConfig';

export async function connectBrowserless(
  config: BrowserlessConfig,
  signal?: AbortSignal,
): Promise<Browser> {
  signal?.throwIfAborted();
  const url = new URL(config.endpoint);

  if (config.token) url.searchParams.set('token', config.token);
  let browser: Browser;

  try {
    browser = await chromium.connect(url.toString(), { timeout: 30000 });
  } catch {
    // Playwright connection errors contain the URL and credentials. Do not retain the cause.
    throw new Error('Browserless 连接失败，请检查服务地址、Token、网络和 Playwright 版本兼容性。');
  }

  if (signal?.aborted) {
    await browser.close().catch(() => {});
    signal.throwIfAborted();
  }

  return browser;
}
