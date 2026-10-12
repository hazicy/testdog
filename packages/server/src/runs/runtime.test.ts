import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Browser } from 'playwright';
import type { TestRun } from '@testdog/contracts/runs/types';

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  browser: vi.fn(),
  drain: vi.fn(),
  capture: vi.fn(),
  diagnostics: vi.fn(),
  webSessionClose: vi.fn(),
  webRecorderStart: vi.fn(),
  webRecorderStop: vi.fn(),
  webEvidenceCheck: vi.fn(),
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
vi.mock('@testdog/server/login-identities/runtime', () => ({ prepareRunLogin: async () => ({}) }));
vi.mock('@testdog/server/runs/recorder', () => ({
  RunRecorder: class {
    directory = '/tmp';
    start = mocks.webRecorderStart;
    stop = mocks.webRecorderStop;
    onPage = vi.fn();
    onStep = vi.fn();
  },
}));
vi.mock('@testdog/automation/platform/web/playwrightSession', () => ({
  PlaywrightSession: class {
    capabilities = { artifacts: [] };
    close = mocks.webSessionClose;
  },
}));
vi.mock('@testdog/server/runs/evidenceSink', () => ({
  EvidenceSink: class {
    assertComplete = mocks.webEvidenceCheck;
    capture = vi.fn();
  },
}));
vi.mock('@testdog/server/runs/deviceRecorder', () => ({
  DeviceRecorder: class {
    onEvent = vi.fn();
    sample = vi.fn();
    drain = mocks.drain;
    capture = mocks.capture;
    finalizeDiagnostics = mocks.diagnostics;
  },
}));
import { browserConnection } from '@testdog/automation/platform/web/providers/contracts';
import { openPlatformRuntime, RuntimeOpenError } from '@testdog/server/runs/runtime';
import { finalizeRuntime } from '@testdog/server/runs/finalizeRuntime';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.drain.mockResolvedValue(undefined);
  mocks.capture.mockResolvedValue(undefined);
  mocks.diagnostics.mockResolvedValue(undefined);
  mocks.webSessionClose.mockResolvedValue(undefined);
  mocks.webRecorderStart.mockResolvedValue(undefined);
  mocks.webRecorderStop.mockResolvedValue(undefined);
  mocks.webEvidenceCheck.mockReturnValue(undefined);
});
afterEach(() => vi.useRealTimers());

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

function webRuntimeFixture() {
  const context = {
    setDefaultTimeout: vi.fn(),
    newPage: vi.fn().mockResolvedValue({}),
  };
  const browser = {
    version: () => 'fixture',
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
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

  return { request, browser };
}

it('archives web evidence and closes the browser even when session disposal fails', async () => {
  const { request, browser } = webRuntimeFixture();
  const runtime = await openPlatformRuntime(request);

  mocks.webSessionClose.mockRejectedValue(new Error('session close failed'));

  await expect(finalizeRuntime(runtime, false)).rejects.toMatchObject({
    errors: [
      expect.objectContaining({
        errors: [expect.objectContaining({ message: 'session close failed' })],
      }),
    ],
  });
  expect(mocks.webSessionClose).toHaveBeenCalledOnce();
  expect(mocks.webRecorderStop).toHaveBeenCalledOnce();
  expect(mocks.webEvidenceCheck).toHaveBeenCalledOnce();
  expect(browser.close).toHaveBeenCalledOnce();
  expect(runtime.healthy).toBe(true);
});

it('checks evidence completeness and closes the browser when web archival fails', async () => {
  const { request, browser } = webRuntimeFixture();
  const runtime = await openPlatformRuntime(request);

  mocks.webRecorderStop.mockRejectedValue(new Error('video archive failed'));
  mocks.webEvidenceCheck.mockImplementation(() => {
    throw new Error('evidence incomplete');
  });

  await expect(finalizeRuntime(runtime, true)).rejects.toMatchObject({
    errors: [
      expect.objectContaining({
        errors: [
          expect.objectContaining({ message: 'video archive failed' }),
          expect.objectContaining({ message: 'evidence incomplete' }),
        ],
      }),
    ],
  });
  expect(mocks.webSessionClose).toHaveBeenCalledOnce();
  expect(mocks.webEvidenceCheck).toHaveBeenCalledOnce();
  expect(browser.close).toHaveBeenCalledOnce();
  expect(runtime.healthy).toBe(true);
});
