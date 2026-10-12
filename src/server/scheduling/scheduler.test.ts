import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const isolated = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));

vi.mock('@/db', async () => {
  const result = await (await import('@/server/testing/testDatabase')).createTestDatabase();

  isolated.client = result.client;

  return { db: result.db };
});
import {
  claimRun,
  registerWorker,
  recoverLeases,
  listResources,
  withLease,
  recoverResource,
  releaseLease,
} from './scheduler';
import { appendEvent, getRun, insertStep } from '@/server/runs/repository';
import { createRun } from '@/server/runs/submission';
import { finishRun, requestCancellation } from '@/server/runs/lifecycle';

afterAll(() => isolated.client!.close());
beforeEach(async () => {
  await isolated.client!.exec(
    'TRUNCATE automation_resources, automation_workers, automation_run_events, run_artifacts, run_steps, test_runs, test_cases CASCADE',
  );
});
const target = {
  schemaVersion: 1,
  platform: 'ios',
  appId: 'com.example.test',
  deviceProfileId: 'iphone',
  resetPolicy: 'preserve',
} as const;

async function setup() {
  await registerWorker('worker-a', 'host', [
    { id: 'host:iphone', hostId: 'host', platform: 'ios', profileId: 'iphone', deviceId: 'udid' },
  ]);
  await registerWorker('worker-b', 'host', []);
}

it('persists queued work and grants only one worker a device; completed release allows the next run', async () => {
  await setup();
  const first = await createRun({ case: 'Check', target });
  const second = await createRun({ case: 'Check', target });

  expect((await getRun(first.id)).status).toBe('queued');
  const claims = await Promise.all([claimRun('worker-a', 'host'), claimRun('worker-b', 'host')]);

  expect(claims.filter(Boolean)).toHaveLength(1);
  const claim = claims.find(Boolean)!;

  await withLease(claim.lease, async () => {
    await appendEvent(claim.run.id, 'started');
    await finishRun(claim.run.id, 'passed', claim.run.startedAt);
  });
  await releaseLease(claim.lease, true);
  const next = await claimRun('worker-b', 'host');

  expect(next?.run.id).toBe(second.id);
  expect(next?.lease.fencingToken).toBeGreaterThan(claim.lease.fencingToken);
});
it('quarantines expired devices even while the old owner lives; rejects stale and unscoped evidence writes', async () => {
  await setup();
  await createRun({ case: 'Check', target });
  const claim = (await claimRun('worker-a', 'host'))!;

  await expect(appendEvent(claim.run.id, 'unowned')).rejects.toThrow('lease lost');
  await isolated.client!.query(
    'UPDATE test_runs SET "leaseUntil" = now() - interval \'1 second\' WHERE id = $1',
    [claim.run.id],
  );
  await isolated.client!.exec(
    'UPDATE automation_resources SET "leaseUntil" = now() - interval \'1 second\'',
  );
  await recoverLeases();
  expect((await getRun(claim.run.id)).status).toBe('failed');
  expect((await listResources())[0].status).toBe('quarantined');
  await createRun({ case: 'Another', target });
  expect(await claimRun('worker-b', 'host')).toBeUndefined();
  await expect(
    withLease(claim.lease, () =>
      insertStep({
        id: randomUUID(),
        runId: claim.run.id,
        sequence: 1,
        kind: 'action',
        title: 'stale',
        status: 'passed',
        startedAt: new Date().toISOString(),
        pageId: 'app',
        pageUrl: '',
        replayable: true,
      }),
    ),
  ).rejects.toThrow('lease lost');
  await releaseLease(claim.lease, true);
  expect((await listResources())[0].status).toBe('quarantined');
  await expect(recoverResource('host:iphone', 'host', async () => false)).rejects.toThrow(
    '继续隔离',
  );
  expect((await recoverResource('host:iphone', 'host', async () => true))?.status).toBe(
    'available',
  );
});
it('cancels queued work without dispatch and runs different devices independently', async () => {
  await setup();
  const queued = await createRun({ case: 'Check', target });

  await requestCancellation(queued.id);
  expect((await getRun(queued.id)).status).toBe('cancelled');
  expect(await claimRun('worker-a', 'host')).toBeUndefined();
  await registerWorker('worker-c', 'host', [
    {
      id: 'host:android',
      hostId: 'host',
      platform: 'android',
      profileId: 'pixel',
      deviceId: 'serial',
    },
  ]);
  await createRun({ case: 'Check', target });
  await createRun({
    case: 'Check',
    target: { ...target, platform: 'android', deviceProfileId: 'pixel' },
  });
  expect(
    (await Promise.all([claimRun('worker-a', 'host'), claimRun('worker-c', 'host')])).filter(
      Boolean,
    ),
  ).toHaveLength(2);
});
it('rejects re-registering a physical device under a new resource or changing an existing binding', async () => {
  await setup();
  await expect(
    registerWorker('worker-b', 'host', [
      {
        id: 'different-id',
        hostId: 'host',
        platform: 'ios',
        profileId: 'iphone',
        deviceId: 'udid',
      },
    ]),
  ).rejects.toThrow('绑定');
  await expect(
    registerWorker('worker-b', 'host', [
      {
        id: 'host:iphone',
        hostId: 'host',
        platform: 'ios',
        profileId: 'other-profile',
        deviceId: 'other-udid',
      },
    ]),
  ).rejects.toThrow('绑定');
});
