import { createClient } from 'redis';

export function redisKey(suffix: string) {
  return `${process.env.CASEFORGE_REDIS_PREFIX || 'caseforge'}:${suffix}`;
}

function makeClient() {
  const client = createClient({
    url: process.env.REDIS_URL,
    disableOfflineQueue: true,
    commandsQueueMaxLength: 128,
    socket: {
      connectTimeout: 1500,
      reconnectStrategy: (retries) => Math.min(500 * (retries + 1), 5000),
    },
  });

  // Never log URLs/errors containing connection credentials.
  client.on('error', () => {});

  return client;
}

type Client = ReturnType<typeof makeClient>;
const state = globalThis as typeof globalThis & {
  caseforgeRedis?: Client;
  caseforgeRedisSubscriber?: Client;
};

export function redisClient(subscriber = false) {
  if (!process.env.REDIS_URL) throw new Error('Redis is not configured');
  const field = subscriber ? 'caseforgeRedisSubscriber' : 'caseforgeRedis';
  const client = (state[field] ??= makeClient());
  if (!client.isOpen) void client.connect().catch(() => {});

  return client;
}

export async function readyRedis(subscriber = false) {
  const client = redisClient(subscriber);
  if (!client.isReady) throw new Error('Realtime service is unavailable');

  return client.withCommandOptions({ timeout: 1500 });
}

export async function closeRedis() {
  for (const client of [state.caseforgeRedis, state.caseforgeRedisSubscriber])
    if (client?.isOpen) client.destroy();
  state.caseforgeRedis = undefined;
  state.caseforgeRedisSubscriber = undefined;
}
