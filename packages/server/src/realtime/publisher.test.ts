import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';

const isolated = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
  publish: vi.fn(),
}));

vi.mock('@testdog/server/db', async () => {
  const result = await (await import('@testdog/server/testing/testDatabase')).createTestDatabase();

  isolated.client = result.client;

  return { db: result.db };
});
vi.mock('@testdog/server/shared/redis', () => ({
  readyRedis: async () => ({ publish: isolated.publish }),
  redisClient: vi.fn(),
  redisKey: (key: string) => `test:${key}`,
}));
import { flushOutbox } from './realtime';

afterAll(() => isolated.client!.close());
beforeEach(async () => {
  await isolated.client!.exec('TRUNCATE realtime_outbox');
  isolated.publish.mockReset().mockResolvedValue(1);
});

async function enqueue() {
  const result = await isolated.client!.query<{ id: number }>(
    "INSERT INTO realtime_outbox(kind, data, summary) VALUES ('issues', '{}', true) RETURNING id",
  );

  return result.rows[0].id;
}

it('commits a claim before publishing and confirms it afterwards', async () => {
  const id = await enqueue();

  isolated.publish.mockImplementation(async () => {
    // A separate transaction can read the durable claim while network I/O is in progress.
    await isolated.client!.transaction(async (tx) => {
      const { rows } = await tx.query(
        'SELECT "claimToken", "claimUntil", "publishedAt" FROM realtime_outbox WHERE id=$1',
        [id],
      );

      expect(rows[0]).toMatchObject({
        claimToken: expect.any(String),
        claimUntil: expect.any(Date),
        publishedAt: null,
      });
    });

    return 1;
  });
  await flushOutbox();
  expect(isolated.publish).toHaveBeenCalledOnce();
  const { rows } = await isolated.client!.query(
    'SELECT "claimToken", "publishedAt" FROM realtime_outbox WHERE id=$1',
    [id],
  );

  expect(rows[0]).toEqual({ claimToken: null, publishedAt: expect.any(Date) });
});

it('releases failed batches for retry and skips unexpired claims', async () => {
  const id = await enqueue();

  isolated.publish.mockRejectedValueOnce(new Error('offline'));
  await flushOutbox();
  const { rows } = await isolated.client!.query(
    'SELECT "claimToken", "publishedAt" FROM realtime_outbox WHERE id=$1',
    [id],
  );

  expect(rows[0]).toEqual({ claimToken: null, publishedAt: null });
  await isolated.client!.query(
    `UPDATE realtime_outbox SET "claimToken"=$1, "claimUntil"=now()+interval '1 minute' WHERE id=$2`,
    [randomUUID(), id],
  );
  await flushOutbox();
  expect(isolated.publish).toHaveBeenCalledOnce();
  await isolated.client!.query(
    `UPDATE realtime_outbox SET "claimUntil"=now()-interval '1 second' WHERE id=$1`,
    [id],
  );
  await flushOutbox();
  expect(isolated.publish).toHaveBeenCalledTimes(2);
});

it('cannot acknowledge a batch reclaimed by another publisher', async () => {
  const id = await enqueue();
  const replacement = randomUUID();

  isolated.publish.mockImplementation(async () => {
    await isolated.client!.query('UPDATE realtime_outbox SET "claimToken"=$1 WHERE id=$2', [
      replacement,
      id,
    ]);

    return 1;
  });
  await flushOutbox();
  const { rows } = await isolated.client!.query(
    'SELECT "claimToken", "publishedAt" FROM realtime_outbox WHERE id=$1',
    [id],
  );

  expect(rows[0]).toEqual({ claimToken: replacement, publishedAt: null });
});
