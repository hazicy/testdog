import type { WebTarget } from '@testdog/contracts/automation/platform/target';
import { localBrowserProvider } from '@testdog/automation/platform/web/providers/local';
import type { BrowserConnection } from '@testdog/automation/platform/web/providers/contracts';
import { WorkspaceError } from '@testdog/server/shared/errors';
import {
  browserProviderForRun,
  savedBrowserProvider,
} from '@testdog/server/browser-providers/repository';

export async function openRunBrowser(
  runId: string,
  target: WebTarget,
  signal: AbortSignal,
): Promise<BrowserConnection> {
  signal.throwIfAborted();
  const selected = await browserProviderForRun(runId, target.browser);

  if (selected && selected.definition.adapter.supportedBrowsers.includes(target.browser)) {
    return selected.definition.adapter.connect(target, selected.config, signal);
  }

  return localBrowserProvider.connect(target, undefined, signal);
}

export async function testBrowserProvider(
  provider: string,
  userId: string | null,
  signal: AbortSignal,
) {
  const { definition, config } = await savedBrowserProvider(provider, userId);
  const browser = definition.adapter.supportedBrowsers[0];

  if (!browser) throw new WorkspaceError('浏览器服务没有支持的浏览器。');
  let connection: BrowserConnection | undefined;
  const stop = () => {
    void connection?.close().catch(() => {});
  };

  signal.addEventListener('abort', stop, { once: true });
  try {
    connection = await definition.adapter.connect(
      {
        schemaVersion: 1,
        platform: 'web',
        browser,
        deviceProfile: 'legacy-desktop',
        url: 'https://example.com',
      },
      config,
      signal,
    );
    signal.throwIfAborted();
    const context = await connection.browser.newContext();

    try {
      const page = await context.newPage();

      await page.setContent('<title>Browser provider connection test</title>', { timeout: 15000 });
      if ((await page.title()) !== 'Browser provider connection test') throw new Error();
      signal.throwIfAborted();

      return { success: true, browserVersion: connection.browser.version() };
    } finally {
      await context.close();
    }
  } catch {
    throw new WorkspaceError(
      '浏览器服务连接测试失败，请检查地址、凭据、网络和协议版本兼容性。',
      502,
    );
  } finally {
    signal.removeEventListener('abort', stop);
    try {
      await connection?.close();
    } catch {
      throw new WorkspaceError('浏览器服务会话释放失败，请检查服务状态。', 502);
    }
  }
}
