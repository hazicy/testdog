import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { createTestDatabase } from '@testdog/server/testing/testDatabase';

const isolated = vi.hoisted(() => ({ db: undefined as unknown }));
const redis = vi.hoisted(() => ({ publish: vi.fn(), ready: vi.fn() }));

vi.mock('@testdog/server/db', () => ({
  get db() {
    return isolated.db;
  },
}));
vi.mock('@testdog/server/shared/redis', () => ({
  readyRedis: redis.ready,
  redisKey: (key: string) => `test:${key}`,
  redisClient: vi.fn(),
}));
import { createTestDatabase as createDatabase } from '@testdog/server/testing/testDatabase';
import {
  flushOutbox,
  readRunUpdates,
  startOutboxPublisher,
  stopOutboxPublisher,
} from '@testdog/server/realtime/realtime';

let database: Awaited<ReturnType<typeof createTestDatabase>>;
const runId = randomUUID();

beforeAll(async () => {
  database = await createDatabase();
  isolated.db = database.db;
  await database.client.query(
    `INSERT INTO test_runs (id, name, "targetSnapshot", goal, status) VALUES ($1, 'Run', '{"schemaVersion":1,"platform":"web","url":"https://example.com","browser":"chromium","deviceProfile":"legacy-desktop"}', 'Check', 'queued')`,
    [runId],
  );
}, 30000);
afterAll(async () => {
  await database.client.close();
});

it('commits ordered deltas with business writes, ignores lease renewals, strips artifact paths and rolls back events', async () => {
  await database.client.query(
    `UPDATE test_runs SET "leaseUntil" = now() + interval '1 minute' WHERE id = $1`,
    [runId],
  );
  const stepId = randomUUID();

  await database.client.query(
    `INSERT INTO run_steps (id, "runId", sequence, kind, title, status, "startedAt", "pageId", "pageUrl") VALUES ($1, $2, 1, 'action', 'Click', 'running', now(), 'page-1', '')`,
    [stepId, runId],
  );
  await database.client.query(
    `INSERT INTO run_artifacts (id, "runId", kind, stage, "pageId", "pageUrl", "capturedAt", "elapsedMs", path, "contentType", size) VALUES ($1, $2, 'screenshot', 'before', 'page-1', '', now(), 0, '/private/evidence.jpg', 'image/jpeg', 5)`,
    [randomUUID(), runId],
  );
  await database.client.query(
    `INSERT INTO run_browser_logs (id, "runId", data) VALUES ($1, $2, $3)`,
    [randomUUID(), runId, JSON.stringify({ id: 'log-1', message: 'hello' })],
  );
  await database.client.exec('BEGIN');
  await database.client.query(`UPDATE test_runs SET status = 'running' WHERE id = $1`, [runId]);
  await database.client.exec('ROLLBACK');
  const updates = await readRunUpdates(runId, 0);

  expect(updates.map((update) => [update.revision, update.kind])).toEqual([
    [1, 'run'],
    [2, 'step'],
    [3, 'artifact'],
    [4, 'logs'],
  ]);
  expect(updates[0].data).not.toHaveProperty('steps');
  expect(updates[2].data).not.toHaveProperty('path');
  expect(updates[3]).toEqual({ kind: 'logs', revision: 4 });
  expect(updates[0].data).not.toHaveProperty('browserLogs');
  expect(
    (
      await database.client.query<{ summary: boolean }>(
        'SELECT summary FROM realtime_outbox ORDER BY id',
      )
    ).rows.map((row) => row.summary),
  ).toEqual([true, false, false, false]);
});

it('retains pending notifications during a Redis outage and tolerates duplicate delivery on retry', async () => {
  redis.ready.mockRejectedValueOnce(new Error('offline'));
  await expect(flushOutbox()).resolves.toBeUndefined();
  expect(
    (await database.client.query('SELECT id FROM realtime_outbox WHERE "publishedAt" IS NULL'))
      .rows,
  ).toHaveLength(4);
  redis.ready.mockResolvedValue({ publish: redis.publish });
  redis.publish.mockRejectedValueOnce(new Error('network reset'));
  await flushOutbox();
  expect(
    (await database.client.query('SELECT id FROM realtime_outbox WHERE "publishedAt" IS NULL'))
      .rows,
  ).toHaveLength(4);
  redis.publish.mockResolvedValue(1);
  await flushOutbox();
  expect(redis.publish).toHaveBeenCalledWith(`test:run:${runId}`, '{"kind":"changed"}');
  expect(redis.publish).toHaveBeenCalledWith('test:workspace:legacy', '{"kind":"changed"}');
  expect(
    (await database.client.query('SELECT id FROM realtime_outbox WHERE "publishedAt" IS NULL'))
      .rows,
  ).toHaveLength(0);
  expect(await readRunUpdates(runId, 2)).toHaveLength(2);
});

it('publishes execution events once, preserves history on run deltas and rolls back event writes', async () => {
  const at = '2026-10-11T00:00:00.123Z';

  await database.client.query(
    'INSERT INTO automation_run_events ("runId",attempt,sequence,at,message) VALUES ($1,1,1,$2,$3)',
    [runId, at, 'Started'],
  );
  await database.client.query("UPDATE test_runs SET status = 'running' WHERE id = $1", [runId]);
  await database.client.exec('BEGIN');
  await database.client.query(
    'INSERT INTO automation_run_events ("runId",attempt,sequence,message) VALUES ($1,1,2,$2)',
    [runId, 'Rolled back'],
  );
  await database.client.exec('ROLLBACK');
  const updates = await readRunUpdates(runId, 4);

  expect(updates.map(({ kind, revision }) => [kind, revision])).toEqual([
    ['event', 5],
    ['run', 6],
  ]);
  expect(updates[0].data).toEqual({ at, message: 'Started' });
  expect(updates[1].data).not.toHaveProperty('events');
  expect(
    (await database.client.query('SELECT summary FROM realtime_outbox WHERE revision > 4')).rows,
  ).toEqual([{ summary: false }, { summary: true }]);
});

it('acknowledges only the published batch and leaves the remaining entries for the next flush', async () => {
  await flushOutbox();
  await database.client.exec(
    `INSERT INTO realtime_outbox (kind,data,summary) SELECT 'tests','{}'::jsonb,true FROM generate_series(1,201)`,
  );
  await flushOutbox();
  expect(
    (await database.client.query('SELECT id FROM realtime_outbox WHERE "publishedAt" IS NULL'))
      .rows,
  ).toHaveLength(1);
  await flushOutbox();
  expect(
    (await database.client.query('SELECT id FROM realtime_outbox WHERE "publishedAt" IS NULL'))
      .rows,
  ).toHaveLength(0);
});

it('drains an in-flight publication before the publisher finishes stopping', async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });

  redis.publish.mockImplementationOnce(() => blocked);
  await database.client.exec(
    `INSERT INTO realtime_outbox (kind,data,summary) VALUES ('tests','{}'::jsonb,true)`,
  );
  startOutboxPublisher();
  const pending = flushOutbox();

  expect(flushOutbox()).toBe(pending);
  await vi.waitFor(() => expect(redis.publish.mock.results.at(-1)?.value).toBe(blocked));
  let stopped = false;
  const stopping = stopOutboxPublisher().then(() => {
    stopped = true;
  });

  await Promise.resolve();
  expect(stopped).toBe(false);
  release();
  await stopping;
  expect(
    (await database.client.query('SELECT id FROM realtime_outbox WHERE "publishedAt" IS NULL'))
      .rows,
  ).toHaveLength(0);
});
