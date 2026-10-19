import { redisClient, redisKey } from '@testdog/server/shared/redis';

export const taskReadyChannel = () => redisKey('tasks:ready');

/** One subscription per worker process; revisions retain notifications received during a claim. */
export function taskWakeup(signal: AbortSignal) {
  let revision = 0;
  let subscribed = false;
  let stopped = false;
  const waiters = new Set<() => void>();
  const wake = () => {
    revision++;
    for (const resolve of [...waiters]) resolve();
  };

  const client = process.env.REDIS_URL ? redisClient(true) : undefined;
  const channel = taskReadyChannel();
  const subscribe = async () => {
    subscribed = false;
    try {
      await client!.withCommandOptions({ timeout: 1500 }).subscribe(channel, wake);
      if (stopped) return;
      subscribed = true;
      wake();
    } catch {
      // A reconnect retries subscription; polling continues in the meantime.
      wake();
    }
  };

  const disconnected = () => {
    subscribed = false;
    wake();
  };

  const stop = () => {
    stopped = true;
    subscribed = false;
    client?.off('ready', subscribe);
    client?.off('reconnecting', disconnected);
    client?.off('end', disconnected);
    if (client?.isReady)
      void client
        .withCommandOptions({ timeout: 1500 })
        .unsubscribe(channel, wake)
        .catch(() => {});
    wake();
  };

  client?.on('ready', subscribe);
  client?.on('reconnecting', disconnected);
  client?.on('end', disconnected);
  if (client?.isReady) void subscribe();
  signal.addEventListener('abort', stop, { once: true });
  if (signal.aborted) stop();

  return {
    get revision() {
      return revision;
    },
    wake,
    wait(observed: number): Promise<void> {
      if (signal.aborted || revision !== observed) return Promise.resolve();

      return new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          waiters.delete(done);
          resolve();
        };

        const timer = setTimeout(done, subscribed && client?.isReady ? 30000 : 1000);

        waiters.add(done);
      });
    },
  };
}
