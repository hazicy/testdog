import { afterEach, expect, test, vi } from 'vitest';
import { hostname } from 'node:os';

const fixture = vi.hoisted(() => ({
  resource: {
    owner: 'host:12345:00000000-0000-0000-0000-000000000000',
    runId: 'run',
    platform: 'ios',
    deviceId: 'device',
    metadata: {} as Record<string, string>,
  },
}));

vi.mock('@testdog/server/scheduling/scheduler', () => ({
  recoverResource: async (
    _id: string,
    _host: string,
    verify: (resource: unknown) => Promise<boolean>,
  ) => verify(fixture.resource),
}));
vi.mock('@testdog/server/runs/repository', () => ({
  getRun: async () => ({ id: 'run', attempt: 1 }),
}));
const sdk = vi.hoisted(() => ({ create: vi.fn(), capabilities: vi.fn() }));

vi.mock('agent-device', () => ({ createAgentDeviceClient: sdk.create }));
import {
  ownerProcessStopped,
  recoverLocalResource,
} from '@testdog/server/scheduling/resourceRecovery';

afterEach(() => vi.restoreAllMocks());
test('only a positively absent local owner PID qualifies for cleanup', () => {
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true);

  expect(ownerProcessStopped(fixture.resource.owner, 'host')).toBe(false);
  expect(ownerProcessStopped(fixture.resource.owner, 'other-host')).toBe(false);
  expect(ownerProcessStopped('host:1:00000000-0000-0000-0000-000000000000', 'host')).toBe(false);
  kill.mockImplementation(() => {
    throw Object.assign(new Error(), { code: 'EPERM' });
  });
  expect(ownerProcessStopped(fixture.resource.owner, 'host')).toBe(false);
  kill.mockImplementation(() => {
    throw Object.assign(new Error(), { code: 'ESRCH' });
  });
  expect(ownerProcessStopped(fixture.resource.owner, 'host')).toBe(true);
});
test('live owner and foreign SDK claims never trigger session cleanup', async () => {
  fixture.resource.metadata = { ownerHostname: hostname() };
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true);

  expect(await recoverLocalResource('resource', 'host')).toBe(false);
  expect(sdk.create).not.toHaveBeenCalled();
  kill.mockImplementation(() => {
    throw Object.assign(new Error(), { code: 'ESRCH' });
  });
  const close = vi.fn();

  sdk.capabilities.mockResolvedValue({ device: { claimedBy: { session: 'unrelated-user' } } });
  sdk.create.mockReturnValue({ devices: { capabilities: sdk.capabilities }, sessions: { close } });
  expect(await recoverLocalResource('resource', 'host')).toBe(false);
  expect(close).not.toHaveBeenCalled();
});
