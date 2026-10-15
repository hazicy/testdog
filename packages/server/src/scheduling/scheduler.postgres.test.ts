import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { hostname } from 'node:os';

const isolated = vi.hoisted(() => ({
  pool: undefined as import('pg').Pool | undefined,
  schema: `testdog_test_${crypto.randomUUID().replaceAll('-', '')}`,
}));

vi.mock('@testdog/server/db', async (original) => {
  const connectionString = process.env.TESTDOG_TEST_DATABASE_URL;

  if (!connectionString) return original<typeof import('@testdog/server/db')>();
  const url = new URL(connectionString);

  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !url.pathname.startsWith('/testdog_test_')
  )
    throw new Error('Real PostgreSQL tests require an explicit local testdog_test_ database');
  const pg = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');

  isolated.pool = new pg.default.Pool({
    connectionString,
    max: 8,
    options: `-c search_path=${isolated.schema}`,
  });

  return { pool: isolated.pool, db: drizzle({ client: isolated.pool }) };
});
import {
  claimRun,
  recoverLeases,
  registerResources,
  releaseLease,
  withLease,
} from '@testdog/server/scheduling/scheduler';
import { createRun } from '@testdog/server/runs/submission';
import { appendEvent, getRun } from '@testdog/server/runs/repository';
import { finishRun } from '@testdog/server/runs/lifecycle';
import { db } from '@testdog/server/db';
import { automationResources } from '@testdog/server/db/schema';
import { eq } from 'drizzle-orm';
import {
  recoverLocalResource,
  ownerProcessStopped,
} from '@testdog/server/scheduling/resourceRecovery';

const live = !!process.env.TESTDOG_TEST_DATABASE_URL;

beforeAll(async () => {
  if (!live) return;
  await isolated.pool!.query(`CREATE SCHEMA ${isolated.schema}`);
  const directory = join(process.cwd(), 'drizzle');

  for (const migration of (await readdir(directory))
    .filter((entry) => /^\d{14}_/.test(entry))
    .sort())
    await isolated.pool!.query(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
}, 30000);
afterAll(async () => {
  if (!isolated.pool) return;
  try {
    await isolated.pool.query(`DROP SCHEMA ${isolated.schema} CASCADE`);
  } finally {
    await isolated.pool.end();
  }
});
it.skipIf(!live)(
  'claims distinct devices across concurrent PostgreSQL connections and rejects expired owners',
  async () => {
    const registrations = ['a', 'b'].map((id) => ({
      id: `device-${id}`,
      hostId: 'host',
      platform: 'ios' as const,
      profileId: 'iphone',
      deviceId: `udid-${id}`,
    }));

    await registerResources(registrations);
    const target = {
      schemaVersion: 1 as const,
      platform: 'ios' as const,
      appId: 'com.example.test',
      deviceProfileId: 'iphone',
      resetPolicy: 'preserve' as const,
    };
    const queued = await Promise.all(
      Array.from({ length: 5 }, () => createRun({ case: 'concurrent', target }, undefined, null)),
    );
    const contenders = await Promise.all(
      Array.from({ length: 8 }, (_, index) => claimRun(`worker-${index}`, 'host')),
    );
    const claimed = contenders.filter((claim) => claim !== undefined);

    // The transaction holding all available resource rows may make simultaneous
    // claimers skip them. Once it commits, another connection can claim the other slot.
    while (claimed.length < 2) {
      const next = await claimRun(`worker-next-${claimed.length}`, 'host');

      if (!next) break;
      claimed.push(next);
    }

    expect(claimed).toHaveLength(2);
    expect(new Set(claimed.map((claim) => claim.run.id)).size).toBe(2);
    expect(new Set(claimed.map((claim) => claim.resource.deviceId)).size).toBe(2);
    await Promise.all(
      claimed.map((claim) =>
        withLease(claim.lease, () => appendEvent(claim.run.id, 'parallel execution')),
      ),
    );
    const old = claimed[0];

    await isolated.pool!.query(
      'UPDATE test_runs SET "leaseUntil"=now()-interval \'1 second\' WHERE id=$1',
      [old.run.id],
    );
    await recoverLeases();
    await expect(withLease(old.lease, () => appendEvent(old.run.id, 'late write'))).rejects.toThrow(
      'lease lost',
    );
    expect((await getRun(old.run.id, { userId: null })).errorCode).toBe('WORKER_LOST');
    const [quarantined] = await db
      .select()
      .from(automationResources)
      .where(eq(automationResources.id, old.resource.id));

    expect(quarantined.status).toBe('quarantined');
    await registerResources(registrations);
    expect(await claimRun('replacement', 'host')).toBeUndefined();
    const healthy = claimed[1];

    await withLease(healthy.lease, () =>
      finishRun(healthy.run.id, 'passed', healthy.run.startedAt),
    );
    await releaseLease(healthy.lease, true);
    const next = (await claimRun('replacement', 'host'))!;

    expect(next.resource.id).toBe(healthy.resource.id);
    expect(next.lease.fencingToken).toBeGreaterThan(healthy.lease.fencingToken);
    expect(queued.some((run) => run.id === next.run.id)).toBe(true);
  },
  30000,
);
it.skipIf(!live)(
  'does not allow evidence writes before a worker has claimed a queued run',
  async () => {
    const run = await createRun({ case: 'unclaimed', url: 'https://example.com' }, undefined, null);

    await expect(appendEvent(run.id, randomUUID())).rejects.toThrow('claimed');
  },
);

it.skipIf(!live || !process.env.TESTDOG_ANDROID_SERIAL)(
  'recovers a quarantined local emulator only after the old owner is gone and SDK health succeeds',
  async () => {
    const host = `recovery-${randomUUID()}`;
    const owner = `${host}:2147483646:${randomUUID()}`;

    expect(ownerProcessStopped(owner, host)).toBe(true);
    const resourceId = `recovery-device-${randomUUID()}`;

    await registerResources([
      {
        id: resourceId,
        hostId: host,
        platform: 'android',
        profileId: 'recovery-fixture',
        deviceId: process.env.TESTDOG_ANDROID_SERIAL!,
      },
    ]);
    const run = await createRun(
      {
        case: 'Recovery health',
        target: {
          schemaVersion: 1,
          platform: 'android',
          appId: 'com.testdog.fixture',
          deviceProfileId: 'recovery-fixture',
          resetPolicy: 'preserve',
        },
      },
      undefined,
      null,
    );
    const claim = (await claimRun(owner, host))!;

    expect(claim.run.id).toBe(run.id);
    await isolated.pool!.query(
      'UPDATE test_runs SET "leaseUntil"=now()-interval \'1 second\' WHERE id=$1',
      [run.id],
    );
    await recoverLeases();
    const [before] = await db
      .select()
      .from(automationResources)
      .where(eq(automationResources.id, resourceId));

    expect(before.status).toBe('quarantined');
    expect(before.metadata.ownerHostname).toBe(hostname());
    expect(await recoverLocalResource(resourceId, host)).toMatchObject({
      id: resourceId,
      status: 'available',
      owner: null,
    });
    const [after] = await db
      .select()
      .from(automationResources)
      .where(eq(automationResources.id, resourceId));

    expect(after.status).toBe('available');
    expect(after.owner).toBeNull();
  },
  180000,
);
