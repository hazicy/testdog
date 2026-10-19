import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock('@testdog/server/shared/redis', () => ({
  redisClient: () => redis.client,
  redisKey: (suffix: string) => `test:${suffix}`,
}));
import { taskWakeup } from './wakeup';

const controllers: AbortController[] = [];

function setup(ready = true) {
  vi.useFakeTimers();
  vi.stubEnv('REDIS_URL', 'redis://test');
  const client = Object.assign(new EventEmitter(), {
    isReady: ready,
    subscribe: vi.fn<(channel: string, listener: () => void) => Promise<void>>(async () => {}),
    unsubscribe: vi.fn(async () => {}),
    withCommandOptions() {
      return this;
    },
  });

  redis.client = client;
  const controller = new AbortController();

  controllers.push(controller);

  return { client, controller, wakeup: taskWakeup(controller.signal) };
}

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.abort();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('retains a notification received while claiming and wakes all idle consumers', async () => {
  const { client, wakeup } = setup();

  await Promise.resolve();
  const revision = wakeup.revision;
  const listener = client.subscribe.mock.calls[0][1];
  const first = vi.fn();
  const second = vi.fn();

  void wakeup.wait(revision).then(first);
  void wakeup.wait(revision).then(second);
  listener();
  await Promise.resolve();
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  await wakeup.wait(revision);
  expect(vi.getTimerCount()).toBe(0);
});

it('scans every 30 seconds when subscribed and every second after disconnect', async () => {
  const { client, wakeup } = setup();

  await Promise.resolve();
  const done = vi.fn();

  void wakeup.wait(wakeup.revision).then(done);
  await vi.advanceTimersByTimeAsync(29999);
  expect(done).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(done).toHaveBeenCalledOnce();
  client.isReady = false;
  client.emit('reconnecting');
  const fallback = vi.fn();

  void wakeup.wait(wakeup.revision).then(fallback);
  await vi.advanceTimersByTimeAsync(1000);
  expect(fallback).toHaveBeenCalledOnce();
});

it('wakes on reconnection and abort, removing listeners and timers', async () => {
  const { client, controller, wakeup } = setup(false);
  const before = wakeup.revision;

  client.isReady = true;
  client.emit('ready');
  await Promise.resolve();
  expect(wakeup.revision).toBeGreaterThan(before);
  const done = vi.fn();

  void wakeup.wait(wakeup.revision).then(done);
  controller.abort();
  await Promise.resolve();
  expect(done).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  expect(client.listenerCount('ready')).toBe(0);
  expect(client.unsubscribe).toHaveBeenCalledWith('test:tasks:ready', expect.any(Function));
});

it('keeps polling when Redis is not configured', async () => {
  const { controller } = setup(false);

  vi.stubEnv('REDIS_URL', '');
  const wakeup = taskWakeup(controller.signal);
  const done = vi.fn();

  void wakeup.wait(wakeup.revision).then(done);
  await vi.advanceTimersByTimeAsync(1000);
  expect(done).toHaveBeenCalledOnce();
});
