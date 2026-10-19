import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const isolated = vi.hoisted(() => ({ db: undefined as unknown, send: vi.fn() }));

vi.mock('@testdog/server/integrations/delivery', () => ({ sendNotification: isolated.send }));

vi.mock('@/server/shared/auth', () => ({ requireUserId: async () => null }));
vi.mock('@testdog/server/db', () => ({
  get db() {
    return isolated.db;
  },
}));
import { createTestDatabase } from '@testdog/server/testing/testDatabase';
import { closeRedis, readyRedis, redisClient, redisKey } from '@testdog/server/shared/redis';
import {
  hasPreviewViewers,
  latestPreview,
  publishPreview,
  watchPreview,
} from '@testdog/server/realtime/preview';
import { flushOutbox, stopOutboxPublisher } from '@testdog/server/realtime/realtime';
import { startNotificationDispatcher } from '@testdog/server/integrations/dispatcher';
import { notificationReadyChannel } from '@testdog/server/integrations/wakeup';
import { encryptSecret } from '@testdog/server/shared/secrets';
import { taskWakeup } from '@testdog/server/scheduling/wakeup';
import { eventStream } from '@/server/realtime/eventStream';
import { GET as previewResponse } from '../../../../apps/web/src/app/api/runs/[id]/preview/route';

const binary = process.env.TESTDOG_TEST_REDIS_BINARY;
let server: ChildProcess;
let database: Awaited<ReturnType<typeof createTestDatabase>>;
const runId = randomUUID();

beforeAll(async () => {
  if (!binary) return;
  const socket = createServer();

  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = (socket.address() as import('node:net').AddressInfo).port;

  await new Promise<void>((resolve) => socket.close(() => resolve()));
  server = spawn(
    binary,
    ['--bind', '127.0.0.1', '--port', String(port), '--save', '', '--appendonly', 'no'],
    { stdio: 'ignore' },
  );
  vi.stubEnv('REDIS_URL', `redis://127.0.0.1:${port}`);
  vi.stubEnv('TESTDOG_REDIS_PREFIX', `test-${randomUUID()}`);
  redisClient();
  redisClient(true);
  await vi.waitFor(
    async () => {
      await readyRedis();
      await readyRedis(true);
    },
    { timeout: 10000 },
  );
  database = await createTestDatabase();
  isolated.db = database.db;
  await database.client.query(
    `INSERT INTO test_runs (id, name, "targetSnapshot", goal, status) VALUES ($1, 'Live', '{"schemaVersion":1,"platform":"web","url":"https://example.com","browser":"chromium","deviceProfile":"legacy-desktop"}', 'Check', 'queued')`,
    [runId],
  );
}, 30000);
afterAll(async () => {
  if (!binary) return;
  await stopOutboxPublisher();
  await closeRedis();
  server?.kill();
  await database?.client.close();
  vi.unstubAllEnvs();
});

it.skipIf(!binary)(
  'shares independent expiring viewers and binary previews through Redis and an owned HTTP endpoint',
  async () => {
    expect(await hasPreviewViewers(runId)).toBe(false);
    await watchPreview(runId, 'first', true);
    await watchPreview(runId, 'second', true);
    await watchPreview(runId, 'first', false);
    expect(await hasPreviewViewers(runId)).toBe(true);
    const client = await readyRedis();

    await client.zAdd(redisKey(`watchers:${runId}`), { score: Date.now() - 1, value: 'second' });
    expect(await hasPreviewViewers(runId)).toBe(false);
    const bytes = Buffer.from([255, 216, 0, 128, 255, 217]);

    await publishPreview(runId, bytes, 'image/jpeg');
    expect(await latestPreview(runId)).toMatchObject({ contentType: 'image/jpeg' });
    expect(await client.ttl(redisKey(`preview:${runId}`))).toBeGreaterThan(0);
    const response = await previewResponse(new Request('http://localhost'), {
      params: Promise.resolve({ id: runId }),
    });

    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(
      (
        await previewResponse(new Request('http://localhost'), {
          params: Promise.resolve({ id: randomUUID() }),
        })
      ).status,
    ).toBe(404);
  },
);

it.skipIf(!binary)(
  'delivers committed deltas through SSE, isolates preview notifications and removes watchers on disconnect',
  async () => {
    const abort = new AbortController();
    const response = await eventStream(
      new Request('http://localhost/events?preview=1', { signal: abort.signal }),
      runId,
      null,
    );
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = '';
    const until = async (event: string) => {
      while (!received.includes(`event: ${event}\n`)) {
        const chunk = await reader.read();

        if (chunk.done) throw new Error(`Stream ended before ${event}`);
        received += decoder.decode(chunk.value);
      }

      const result = received;

      received = '';

      return result;
    };

    expect(await until('ready')).toContain('event: snapshot');
    await vi.waitFor(async () => expect(await hasPreviewViewers(runId)).toBe(true));
    const stepId = randomUUID();

    await database.client.query(
      `INSERT INTO run_steps (id, "runId", sequence, kind, title, status, "startedAt", "pageId", "pageUrl") VALUES ($1, $2, 1, 'action', 'Click', 'running', now(), 'page-1', '')`,
      [stepId, runId],
    );
    await flushOutbox();
    expect(await until('updates')).toContain(stepId);
    await publishPreview(runId, Buffer.from('next-image'), 'image/jpeg');
    expect(await until('preview')).not.toContain('event: updates');
    abort.abort();
    await reader.cancel();
    await vi.waitFor(async () => expect(await hasPreviewViewers(runId)).toBe(false));
  },
  10000,
);

it.skipIf(!binary)(
  'resets to a consistent snapshot when retained deltas have a gap',
  async () => {
    const abort = new AbortController();
    const response = await eventStream(
      new Request('http://localhost/events', { signal: abort.signal }),
      runId,
      null,
    );
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let body = '';

    while (!body.includes('event: ready')) {
      const chunk = await reader.read();

      body += decoder.decode(chunk.value);
    }

    await database.client.query(`UPDATE test_runs SET name = 'Recovered snapshot' WHERE id = $1`, [
      runId,
    ]);
    await database.client.query(
      `DELETE FROM realtime_outbox WHERE "runId" = $1 AND revision = (SELECT "realtimeRevision" FROM test_runs WHERE id = $1)`,
      [runId],
    );
    const client = await readyRedis();

    await client.publish(redisKey(`run:${runId}`), '{"kind":"changed"}');
    body = '';
    while (!body.includes('Recovered snapshot')) {
      const chunk = await reader.read();

      if (chunk.done) throw new Error('Stream ended before reset');
      body += decoder.decode(chunk.value);
    }

    expect(body).toContain('event: snapshot');
    abort.abort();
    await reader.cancel();
  },
  10000,
);

it.skipIf(!binary)('wakes task consumers only for committed queued runs', async () => {
  await flushOutbox();
  const abort = new AbortController();
  const wakeup = taskWakeup(abort.signal);

  try {
    await vi.waitFor(() => expect(wakeup.revision).toBeGreaterThan(0));
    const revision = wakeup.revision;
    const insert = `INSERT INTO test_runs (id, name, "targetSnapshot", goal, status) VALUES ($1, 'Queued', '{"schemaVersion":1,"platform":"web","url":"https://example.com","browser":"chromium","deviceProfile":"legacy-desktop"}', 'Check', 'queued')`;

    await database.client.exec('BEGIN');
    await database.client.query(insert, [randomUUID()]);
    await database.client.exec('ROLLBACK');
    await flushOutbox();
    expect(wakeup.revision).toBe(revision);
    await database.client.query(insert, [randomUUID()]);
    await flushOutbox();
    await vi.waitFor(() => expect(wakeup.revision).toBeGreaterThan(revision));
  } finally {
    abort.abort();
  }
});

it.skipIf(!binary)(
  'streams model and issue invalidations over the existing run connection',
  async () => {
    const abort = new AbortController();
    const response = await eventStream(
      new Request('http://localhost/events', { signal: abort.signal }),
      runId,
      null,
    );
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const until = async (event: string) => {
      let body = '';

      while (!body.includes(`event: ${event}`)) {
        const chunk = await reader.read();

        if (chunk.done) throw new Error('Stream ended before invalidation');
        body += decoder.decode(chunk.value);
      }

      return body;
    };

    try {
      await until('ready');
      await database.client.query(
        `INSERT INTO model_calls ("runId", "startedAt", "durationMs", model, status, "retryCount", "failedAttempts") VALUES ($1, now(), 10, 'test', 'passed', 0, 0)`,
        [runId],
      );
      await flushOutbox();
      expect(await until('updates')).toContain('"kind":"model"');
      const issueId = randomUUID();

      await database.client.query(`INSERT INTO issues (id, title) VALUES ($1, 'New issue')`, [
        issueId,
      ]);
      await database.client.query(
        `INSERT INTO issue_occurrences ("issueId", "runId", snapshot) VALUES ($1, $2, '{}')`,
        [issueId, runId],
      );
      await flushOutbox();
      expect(await until('changed')).toContain('event: changed');
    } finally {
      abort.abort();
      await reader.cancel();
    }
  },
  10000,
);

it.skipIf(!binary)(
  'wakes notification delivery after commit and schedules future work without another message',
  async () => {
    vi.stubEnv('TESTDOG_INTEGRATION_SECRET', 'test-notification-secret-at-least-32-characters');
    isolated.send.mockResolvedValue(undefined);
    const integration = randomUUID();
    const event = randomUUID();
    const config = encryptSecret(
      { webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/fixture' },
      null,
      'feishu',
    );

    await database.client.query(
      `INSERT INTO notification_integrations (id,channel,"encryptedConfig") VALUES ($1,'feishu',$2)`,
      [integration, config],
    );
    await database.client.query(
      `INSERT INTO notification_events (id,"sourceKey","eventType",payload) VALUES ($1,$2,'test','{"title":"Test","body":"Test","path":"/"}')`,
      [event, randomUUID()],
    );
    const stop = startNotificationDispatcher(60000);

    try {
      await vi.waitFor(async () => {
        const client = await readyRedis();
        const subscribers = await client.pubSubNumSub(notificationReadyChannel());

        expect(subscribers[notificationReadyChannel()]).toBe(1);
      });
      await database.client.query(
        `INSERT INTO notification_deliveries ("integrationId","integrationVersion","eventId","nextAttemptAt") VALUES ($1,1,$2,now()+interval '500 milliseconds')`,
        [integration, event],
      );
      await flushOutbox();
      // The only message arrives before this delivery is due; its timer must do the rest.
      await vi.waitFor(() => expect(isolated.send).toHaveBeenCalledOnce(), { timeout: 5000 });
      const status = await database.client.query<{ status: string }>(
        `SELECT status FROM notification_deliveries WHERE "eventId"=$1`,
        [event],
      );

      expect(status.rows[0].status).toBe('sent');
    } finally {
      await stop();
    }
  },
  10000,
);

it.skipIf(!binary)(
  'fails fast when Redis is down, so execution can continue without viewers',
  async () => {
    server.kill();
    await vi.waitFor(async () => expect(await hasPreviewViewers(runId)).toBe(false), {
      timeout: 5000,
    });
    await expect(flushOutbox()).resolves.toBeUndefined();
    await vi.waitFor(
      async () => {
        await expect(readyRedis()).rejects.toThrow('unavailable');
      },
      { timeout: 5000 },
    );
  },
);
