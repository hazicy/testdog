import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Browser } from 'playwright';
import type { TestRun } from '@testdog/contracts/runs/types';

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  browser: vi.fn(),
  drain: vi.fn(),
  capture: vi.fn(),
  diagnostics: vi.fn(),
}));

vi.mock('@testdog/server/shared/model', () => ({ modelClient: {} }));
vi.mock('@testdog/server/runs/repository', () => ({ insertArtifact: vi.fn() }));
vi.mock('@testdog/automation/platform/native/agentDeviceSession', () => ({
  AgentDeviceSession: { open: mocks.open },
}));
vi.mock('@testdog/automation/platform/web/mobile', () => ({
  resolveWebProfile: () => ({ viewport: { width: 400, height: 800 } }),
}));
vi.mock('@testdog/server/browser-providers/runtime', () => ({ openRunBrowser: mocks.browser }));
vi.mock('@testdog/server/runs/recorder', () => ({
  RunRecorder: class {
    directory = '/tmp';
  },
}));
vi.mock('@testdog/server/runs/deviceRecorder', () => ({
  DeviceRecorder: class {
    onEvent = vi.fn();
    sample = vi.fn();
    drain = mocks.drain;
    capture = mocks.capture;
    finalizeVideo = mocks.diagnostics;
  },
}));
import { browserConnection } from '@testdog/automation/platform/web/providers/contracts';
import { openPlatformRuntime } from '@testdog/server/runs/runtime';
import { RuntimeOpenError } from '@testdog/server/runs/runtimeTypes';
import { finalizeRuntime } from '@testdog/server/runs/finalizeRuntime';

beforeEach(() => {
  vi.stubEnv('TESTDOG_WEB_AGENT', 'llm');
  vi.resetAllMocks();
  mocks.drain.mockResolvedValue(undefined);
  mocks.capture.mockResolvedValue(undefined);
  mocks.diagnostics.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const run = {
  id: 'runtime',
  attempt: 1,
  targetSnapshot: {
    schemaVersion: 1,
    platform: 'ios',
    appId: 'com.example.app',
    deviceProfileId: 'fixture',
    resetPolicy: 'preserve',
  },
} as TestRun;
const input = () => ({
  run,
  plan: { rootId: 'root', nodes: {} },
  signal: new AbortController().signal,
  report: vi.fn(),
  resource: { deviceId: 'device', metadata: {} },
});
const session = () => ({
  observe: vi.fn().mockResolvedValue({ viewport: { width: 400, height: 800 } }),
  close: vi.fn().mockResolvedValue(undefined),
  safeToRelease: true,
  environment: {},
  capabilities: { artifacts: [] },
});

it('closes a native session even when evidence archival never settles', async () => {
  vi.useFakeTimers();
  const device = session();

  mocks.open.mockResolvedValue(device);
  mocks.drain.mockReturnValue(new Promise(() => {}));
  const runtime = await openPlatformRuntime(input());
  const finishing = finalizeRuntime(runtime, true);
  const rejected = expect(finishing).rejects.toThrow('归档或资源清理失败');

  await vi.advanceTimersByTimeAsync(30000);
  await rejected;
  expect(device.close).toHaveBeenCalledOnce();
  expect(runtime.healthy).toBe(true);
});

it('preserves a native preparation failure and confirms cleanup before reporting resource health', async () => {
  const device = session();

  device.observe.mockRejectedValue(new Error('device snapshot failed'));
  mocks.open.mockResolvedValue(device);
  await expect(openPlatformRuntime(input())).rejects.toMatchObject({
    healthy: true,
    cause: expect.objectContaining({ message: 'device snapshot failed' }),
  });
  expect(device.close).toHaveBeenCalledOnce();
});

it('checks the frozen replay environment before native execution', async () => {
  const device = session();
  const expectedEnvironment = {
    osVersion: 'recorded-os',
    driverVersion: 'driver',
    buildSha256: 'sha',
  };

  mocks.open.mockResolvedValue(device);
  await expect(openPlatformRuntime({ ...input(), expectedEnvironment })).rejects.toMatchObject({
    healthy: true,
    cause: expect.objectContaining({ message: '设备 osVersion 与录制不兼容，请重新录制' }),
  });
  expect(mocks.open.mock.calls[0][6]).toEqual(expectedEnvironment);
  expect(device.close).toHaveBeenCalledOnce();
});

it('retains both the web preparation and cleanup errors and quarantines an unclosed browser', async () => {
  const browser = {
    version: () => 'fixture',
    newContext: vi.fn().mockRejectedValue(new Error('context failed')),
    close: vi.fn().mockRejectedValue(new Error('browser close failed')),
  };

  mocks.browser.mockResolvedValue(browserConnection(browser as unknown as Browser, 'local'));
  const request = input();

  request.run = {
    ...run,
    targetSnapshot: {
      schemaVersion: 1,
      platform: 'web',
      url: 'https://example.com',
      browser: 'chromium',
      deviceProfile: 'Pixel 7',
    },
  };
  const error = await openPlatformRuntime(request).catch((error) => error);

  expect(error).toBeInstanceOf(RuntimeOpenError);
  expect(browser.newContext).toHaveBeenCalledOnce();
  expect(browser.close).toHaveBeenCalledOnce();
  expect(error.healthy).toBe(false);
  expect(error.cause.errors.map((cause: Error) => cause.message)).toEqual([
    'context failed',
    'browser close failed',
  ]);
});

it('reports a missing hybrid key before opening a browser and keeps the resource healthy', async () => {
  vi.stubEnv('TESTDOG_WEB_AGENT', 'hybrid');
  vi.stubEnv('JEV_API_KEY', '');
  try {
    const request = input();

    request.run = {
      ...run,
      targetSnapshot: {
        schemaVersion: 1,
        platform: 'web',
        url: 'https://example.com',
        browser: 'chromium',
        deviceProfile: 'Pixel 7',
      },
    };
    await expect(openPlatformRuntime(request)).rejects.toMatchObject({
      healthy: true,
      cause: expect.objectContaining({ message: '混合 DOM Agent 需要配置 JEV_API_KEY' }),
    });
    expect(mocks.browser).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});
