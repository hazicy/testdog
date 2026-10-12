import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({
  maintenance: vi.fn(),
  notifications: vi.fn(),
  outbox: vi.fn(),
  stopMaintenance: vi.fn(),
  stopNotifications: vi.fn(),
  stopOutbox: vi.fn(),
  closeRedis: vi.fn(),
  closePool: vi.fn(),
}));

vi.mock('@testdog/server/db', () => ({ pool: { end: services.closePool } }));
vi.mock('@testdog/server/shared/redis', () => ({ closeRedis: services.closeRedis }));
vi.mock('@testdog/server/scheduling/maintenance', () => ({
  startLeaseMaintenance: services.maintenance,
}));
vi.mock('@testdog/server/integrations/dispatcher', () => ({
  startNotificationDispatcher: services.notifications,
}));
vi.mock('@testdog/server/realtime/realtime', () => ({
  startOutboxPublisher: services.outbox,
  stopOutboxPublisher: services.stopOutbox,
}));
import { backgroundServices, runServiceProcess } from './serviceRuntime';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CASEFORGE_BACKGROUND_SERVICES', undefined);
  services.maintenance.mockReturnValue(services.stopMaintenance);
  services.notifications.mockReturnValue(services.stopNotifications);
});
afterEach(() => vi.unstubAllEnvs());

it('selects the default deployment or an explicit subset without duplicate services', () => {
  expect(backgroundServices('worker')).toEqual(['maintenance', 'notifications', 'outbox']);
  expect(backgroundServices('maintenance')).toEqual(backgroundServices('worker'));
  expect(backgroundServices('notifications')).toEqual(['notifications']);
  expect(backgroundServices('worker', 'none')).toEqual([]);
  expect(backgroundServices('maintenance', ' maintenance, outbox,maintenance ')).toEqual([
    'maintenance',
    'outbox',
  ]);
  for (const config of ['', 'unknown', 'none,outbox'])
    expect(() => backgroundServices('worker', config)).toThrow('CASEFORGE_BACKGROUND_SERVICES');
});

it('handles repeated signals once and waits for consumers and publishers before closing connections', async () => {
  let finishConsumer!: () => void;
  let finishPublisher!: () => void;
  const draining = new Promise<void>((resolve) => {
    finishPublisher = resolve;
  });
  const consumed = new Promise<void>((resolve) => {
    finishConsumer = resolve;
  });
  const abort = vi.fn();
  const originalSignals = process.listeners('SIGTERM');

  services.stopOutbox.mockReturnValue(draining);
  const running = runServiceProcess('worker', async ({ signal }) => {
    signal.addEventListener('abort', abort);
    await consumed;
  });
  const handler = process
    .listeners('SIGTERM')
    .find((listener) => !originalSignals.includes(listener))!;

  handler('SIGTERM');
  handler('SIGTERM');
  expect(abort).toHaveBeenCalledTimes(1);
  expect(services.stopOutbox).not.toHaveBeenCalled();
  finishConsumer();
  await vi.waitFor(() => expect(services.stopOutbox).toHaveBeenCalledTimes(1));
  expect(services.closePool).not.toHaveBeenCalled();
  expect(services.closeRedis).not.toHaveBeenCalled();
  finishPublisher();
  await running;
  expect(services.closeRedis).toHaveBeenCalledOnce();
  expect(services.closePool).toHaveBeenCalledOnce();
  expect(process.listeners('SIGTERM')).toEqual(originalSignals);
});

it('cleans up services already started when a later service fails to start', async () => {
  services.notifications.mockImplementation(() => {
    throw new Error('startup failed');
  });
  await expect(runServiceProcess('worker')).rejects.toThrow('startup failed');
  expect(services.stopMaintenance).toHaveBeenCalledOnce();
  expect(services.outbox).not.toHaveBeenCalled();
  expect(services.closeRedis).toHaveBeenCalledOnce();
  expect(services.closePool).toHaveBeenCalledOnce();
});

it('still closes every connection when a service stop fails', async () => {
  services.stopNotifications.mockRejectedValue(new Error('drain failed'));
  await expect(runServiceProcess('maintenance', async () => {})).rejects.toThrow('drain failed');
  expect(services.stopMaintenance).toHaveBeenCalledOnce();
  expect(services.stopOutbox).toHaveBeenCalledOnce();
  expect(services.closeRedis).toHaveBeenCalledOnce();
  expect(services.closePool).toHaveBeenCalledOnce();
});

it('keeps the standalone notifications process alive until signalled and only starts notifications', async () => {
  const originalSignals = process.listeners('SIGINT');
  const running = runServiceProcess('notifications');
  const handler = process
    .listeners('SIGINT')
    .find((listener) => !originalSignals.includes(listener))!;

  expect(services.maintenance).not.toHaveBeenCalled();
  expect(services.outbox).not.toHaveBeenCalled();
  expect(services.closePool).not.toHaveBeenCalled();
  handler('SIGINT');
  await running;
  expect(services.stopNotifications).toHaveBeenCalledOnce();
  expect(process.listeners('SIGINT')).toEqual(originalSignals);
});
