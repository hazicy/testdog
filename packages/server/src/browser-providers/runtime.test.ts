import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebTarget } from '@testdog/contracts/automation/platform/target';

const mocks = vi.hoisted(() => ({ forRun: vi.fn(), saved: vi.fn(), local: vi.fn() }));

vi.mock('@testdog/server/browser-providers/repository', () => ({
  browserProviderForRun: mocks.forRun,
  savedBrowserProvider: mocks.saved,
}));
vi.mock('@testdog/engine/platform/web/providers/local', () => ({
  localBrowserProvider: {
    id: 'local',
    supportedBrowsers: ['chromium', 'webkit'],
    connect: mocks.local,
  },
}));
import { openRunBrowser, testBrowserProvider } from '@testdog/server/browser-providers/runtime';

const target: WebTarget = {
  schemaVersion: 1,
  platform: 'web',
  browser: 'chromium',
  deviceProfile: 'legacy-desktop',
  url: 'https://example.com',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('pluggable browser execution', () => {
  it('selects any registered adapter, forwarding its config and lifecycle', async () => {
    const connection = {
      provider: 'future-provider',
      artifacts: ['screenshot'],
      browser: {},
      close: vi.fn(),
    };
    const connect = vi.fn().mockResolvedValue(connection);
    const config = { account: 'private' };

    mocks.forRun.mockResolvedValue({
      definition: { adapter: { supportedBrowsers: ['chromium'], connect } },
      config,
    });
    const signal = new AbortController().signal;

    expect(await openRunBrowser('run', target, signal)).toBe(connection);
    expect(mocks.forRun).toHaveBeenCalledWith('run', 'chromium');
    expect(connect).toHaveBeenCalledWith(target, config, signal);
    expect(mocks.local).not.toHaveBeenCalled();
  });
  it('uses local when disabled or the selected service does not support WebKit', async () => {
    mocks.forRun.mockResolvedValue(undefined);
    await openRunBrowser('run', target, new AbortController().signal);
    expect(mocks.local).toHaveBeenCalledOnce();
    await openRunBrowser('run', { ...target, browser: 'webkit' }, new AbortController().signal);
    expect(mocks.forRun).toHaveBeenLastCalledWith('run', 'webkit');
    expect(mocks.local).toHaveBeenCalledTimes(2);
  });
  it('does not fall back after a remote failure or ignore invalid stored credentials', async () => {
    mocks.forRun.mockResolvedValue({
      definition: {
        adapter: {
          supportedBrowsers: ['chromium'],
          connect: vi.fn().mockRejectedValue(new Error('Remote failed')),
        },
      },
    });
    await expect(openRunBrowser('run', target, new AbortController().signal)).rejects.toThrow(
      'Remote failed',
    );
    mocks.forRun.mockRejectedValue(new Error('Invalid credentials'));
    await expect(openRunBrowser('run', target, new AbortController().signal)).rejects.toThrow(
      'Invalid credentials',
    );
    expect(mocks.local).not.toHaveBeenCalled();
  });
  it('tests saved configuration and releases context and adapter on success or failure', async () => {
    const context = {
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn(),
        title: vi.fn().mockResolvedValue('Browser provider connection test'),
      }),
      close: vi.fn(),
    };
    const connection = {
      browser: { newContext: vi.fn().mockResolvedValue(context), version: () => '123' },
      close: vi.fn(),
    };

    mocks.saved.mockResolvedValue({
      definition: {
        adapter: {
          supportedBrowsers: ['chromium'],
          connect: vi.fn().mockResolvedValue(connection),
        },
      },
      config: {},
    });
    expect(
      await testBrowserProvider('future-provider', 'alice', new AbortController().signal),
    ).toEqual({ success: true, browserVersion: '123' });
    expect(context.close).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
    context.newPage.mockRejectedValue(new Error('failure with private token'));
    await expect(
      testBrowserProvider('future-provider', 'alice', new AbortController().signal),
    ).rejects.toMatchObject({ status: 502, message: expect.not.stringContaining('private token') });
    expect(context.close).toHaveBeenCalledTimes(2);
    expect(connection.close).toHaveBeenCalledTimes(2);
  });
});
