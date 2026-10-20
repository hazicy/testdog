import { beforeEach, expect, it, vi } from 'vitest';

const connect = vi.hoisted(() => vi.fn());

vi.mock('playwright', () => ({ chromium: { connect } }));
import { connectBrowserless } from '@testdog/engine/platform/web/browserless';
import { browserConnection } from '@testdog/engine/platform/web/providers/contracts';
import type { Browser } from 'playwright';

beforeEach(() => {
  connect.mockReset();
});
it('uses native protocol and encodes token with a bounded connection timeout', async () => {
  const browser = { close: vi.fn() };

  connect.mockResolvedValue(browser);
  expect(
    await connectBrowserless({
      endpoint: 'wss://host/chromium/playwright?blockAds=true',
      token: 'secret&token',
    }),
  ).toBe(browser);
  const url = new URL(connect.mock.calls[0][0]);

  expect(url.searchParams.get('token')).toBe('secret&token');
  expect(url.searchParams.get('blockAds')).toBe('true');
  expect(connect.mock.calls[0][1]).toEqual({ timeout: 30000 });
});
it('sanitizes connection errors without retaining the credential-bearing cause', async () => {
  connect.mockRejectedValue(new Error('wss://host?token=secret'));
  const error = await connectBrowserless({
    endpoint: 'wss://host/chromium/playwright',
    token: 'secret',
  }).catch((error: Error) => error);

  expect(error).toBeInstanceOf(Error);
  expect(String(error)).not.toContain('secret');
  expect(error).not.toHaveProperty('cause');
});
it('closes a connection that resolves after cancellation', async () => {
  const controller = new AbortController();
  const close = vi.fn().mockResolvedValue(undefined);

  connect.mockImplementation(async () => {
    controller.abort();

    return { close };
  });
  await expect(
    connectBrowserless({ endpoint: 'wss://host/chromium/playwright' }, controller.signal),
  ).rejects.toThrow();
  expect(close).toHaveBeenCalledOnce();
});
it('makes adapter release idempotent', async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  const connection = browserConnection({ close } as unknown as Browser, 'provider');

  await Promise.all([connection.close(), connection.close()]);
  expect(close).toHaveBeenCalledOnce();
});
