import { hostname } from 'node:os';
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  automationResources as resources,
  automationWorkers as workers,
  testRuns,
  runSteps,
} from '@/db/schema';
import { getRun } from '@/server/runs/repository';
import { WorkspaceError } from '@/server/shared/errors';
import { leaseScope, type RunLease } from './lease';
import { activeRunStatuses } from '@/features/runs/types';

type ResourceRegistration = Pick<
  typeof resources.$inferInsert,
  'id' | 'hostId' | 'platform' | 'profileId' | 'deviceId' | 'metadata'
>;

export async function registerWorker(
  id: string,
  hostId: string,
  registrations: ResourceRegistration[],
) {
  await db
    .insert(workers)
    .values({ id, hostId, platforms: [...new Set(registrations.map((r) => r.platform))] })
    .onConflictDoUpdate({ target: workers.id, set: { heartbeatAt: new Date().toISOString() } });
  for (const resource of registrations) {
    // Registration must never clear an existing claim or quarantine.
    const [inserted] = await db
      .insert(resources)
      .values(resource)
      .onConflictDoNothing()
      .returning();

    if (!inserted) {
      const [existing] = await db.select().from(resources).where(eq(resources.id, resource.id));

      if (
        !existing ||
        existing.hostId !== resource.hostId ||
        existing.platform !== resource.platform ||
        existing.profileId !== resource.profileId ||
        (existing.deviceId ?? undefined) !== resource.deviceId
      )
        throw new WorkspaceError('资源 ID 或物理设备已经绑定到不同配置，请使用原登记配置。', 409);
    }
  }
}

export async function claimRun(workerId: string, hostId: string, requestedId?: string) {
  const claimed = await db.transaction(async (tx) => {
    const available = await tx
      .select()
      .from(resources)
      .where(and(eq(resources.hostId, hostId), eq(resources.status, 'available')))
      .orderBy(asc(resources.id))
      .for('update', { skipLocked: true });

    for (const resource of available) {
      const platform = sql`coalesce(${testRuns.targetSnapshot}->>'platform', 'web')`;
      const profile = sql`${testRuns.targetSnapshot}->>'deviceProfileId'`;
      const [run] = await tx
        .select()
        .from(testRuns)
        .where(
          and(
            eq(testRuns.status, 'queued'),
            eq(testRuns.cancelRequested, false),
            sql`${platform} = ${resource.platform}`,
            resource.platform === 'web' ? undefined : sql`${profile} = ${resource.profileId}`,
            requestedId ? eq(testRuns.id, requestedId) : undefined,
          ),
        )
        .orderBy(asc(testRuns.queuedAt))
        .limit(1)
        .for('update', { skipLocked: true });

      if (!run) continue;
      const token = resource.fencingToken + 1;
      const leaseUntil = new Date(Date.now() + 60000).toISOString();

      await tx
        .update(resources)
        .set({
          status: 'busy',
          owner: workerId,
          runId: run.id,
          fencingToken: token,
          leaseUntil,
          metadata: { ...resource.metadata, ownerHostname: hostname() },
        })
        .where(eq(resources.id, resource.id));
      await tx
        .update(testRuns)
        .set({
          status: 'preparing',
          workerId,
          resourceId: resource.id,
          fencingToken: token,
          heartbeatAt: new Date().toISOString(),
          preparingAt: new Date().toISOString(),
          leaseUntil,
        })
        .where(eq(testRuns.id, run.id));

      return { runId: run.id, workerId, fencingToken: token, resource };
    }
  });

  if (!claimed) return;
  const run = await getRun(claimed.runId);

  return {
    run,
    lease: { runId: run.id, workerId, fencingToken: claimed.fencingToken } satisfies RunLease,
    resource: claimed.resource,
  };
}

export async function renewLease(lease: RunLease) {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select({
        id: testRuns.id,
        resourceId: testRuns.resourceId,
        cancelRequested: testRuns.cancelRequested,
      })
      .from(testRuns)
      .where(
        and(
          eq(testRuns.id, lease.runId),
          eq(testRuns.workerId, lease.workerId),
          eq(testRuns.fencingToken, lease.fencingToken),
          sql`${testRuns.leaseUntil} > now()`,
          inArray(testRuns.status, activeRunStatuses),
        ),
      )
      .for('update');

    if (!run) return;
    const leaseUntil = new Date(Date.now() + 60000).toISOString();

    await tx
      .update(testRuns)
      .set({ leaseUntil, heartbeatAt: new Date().toISOString() })
      .where(eq(testRuns.id, run.id));
    await tx
      .update(resources)
      .set({ leaseUntil })
      .where(
        and(
          eq(resources.id, run.resourceId!),
          eq(resources.owner, lease.workerId),
          eq(resources.fencingToken, lease.fencingToken),
          eq(resources.status, 'busy'),
        ),
      );
    await tx
      .update(workers)
      .set({ heartbeatAt: new Date().toISOString() })
      .where(eq(workers.id, lease.workerId));

    return { cancelRequested: run.cancelRequested };
  });
}

export async function releaseLease(lease: RunLease, healthy: boolean) {
  await db.transaction(async (tx) => {
    const [run] = await tx
      .select({
        workerId: testRuns.workerId,
        fencingToken: testRuns.fencingToken,
        resourceId: testRuns.resourceId,
      })
      .from(testRuns)
      .where(eq(testRuns.id, lease.runId))
      .for('update');

    if (!run || run.workerId !== lease.workerId || run.fencingToken !== lease.fencingToken) return;
    await tx
      .update(resources)
      .set({
        status: healthy ? 'available' : 'quarantined',
        ...(healthy ? { owner: null, runId: null, leaseUntil: null } : {}),
      })
      .where(
        and(
          eq(resources.id, run.resourceId!),
          eq(resources.owner, lease.workerId),
          eq(resources.fencingToken, lease.fencingToken),
          eq(resources.status, 'busy'),
          sql`${resources.leaseUntil} > now()`,
        ),
      );
  });
}

export async function recoverLeases() {
  await db.transaction(async (tx) => {
    const lock = await tx.execute<{ acquired: boolean }>(
      sql`select pg_try_advisory_xact_lock(731904271) as acquired`,
    );

    if (!lock.rows[0].acquired) return;
    const queueTimeout = Number(process.env.CASEFORGE_QUEUE_TIMEOUT_MS || 3600000);

    if (!Number.isFinite(queueTimeout) || queueTimeout < 1000)
      throw new Error('CASEFORGE_QUEUE_TIMEOUT_MS 必须为正毫秒数');
    await tx
      .update(testRuns)
      .set({
        status: 'failed',
        errorCode: 'QUEUE_TIMEOUT',
        error: '等待可用资源超时，请检查 worker 与设备配置。',
        finishedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(testRuns.status, 'queued'),
          lt(testRuns.queuedAt, new Date(Date.now() - queueTimeout).toISOString()),
        ),
      );
    const expired = await tx
      .select({
        id: testRuns.id,
        resourceId: testRuns.resourceId,
        fencingToken: testRuns.fencingToken,
        startedAt: testRuns.startedAt,
      })
      .from(testRuns)
      .where(
        and(
          inArray(testRuns.status, ['preparing', 'running', 'finalizing']),
          lt(testRuns.leaseUntil, new Date().toISOString()),
        ),
      )
      .for('update', { skipLocked: true });

    for (const run of expired) {
      await tx
        .update(resources)
        .set({ status: 'quarantined' })
        .where(
          and(eq(resources.id, run.resourceId!), eq(resources.fencingToken, run.fencingToken)),
        );
      const finishedAt = new Date().toISOString();

      await tx
        .update(testRuns)
        .set({
          status: 'failed',
          errorCode: 'WORKER_LOST',
          evidenceComplete: false,
          error: '执行服务连接中断，请重新运行。',
          durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(run.startedAt)),
          finishedAt,
          replayable: false,
        })
        .where(eq(testRuns.id, run.id));
      await tx
        .update(runSteps)
        .set({
          status: 'failed',
          error: '执行服务连接中断',
          finishedAt,
          durationMs: sql`greatest(0, round(extract(epoch from (${finishedAt}::timestamptz - ${runSteps.startedAt})) * 1000))::integer`,
        })
        .where(and(eq(runSteps.runId, run.id), eq(runSteps.status, 'running')));
    }
  });
}

export const listResources = () => db.select().from(resources).orderBy(asc(resources.id));

// Explicit recovery is separate from TTL reclamation. Caller proves cleanup and health on host.
export async function recoverResource(
  id: string,
  hostId: string,
  verify: (resource: typeof resources.$inferSelect) => Promise<boolean>,
) {
  const [resource] = await db
    .select()
    .from(resources)
    .where(
      and(eq(resources.id, id), eq(resources.hostId, hostId), eq(resources.status, 'quarantined')),
    );

  if (!resource || !(await verify(resource)))
    throw new WorkspaceError('无法证明旧执行已停止且设备健康，继续隔离。', 409);
  const [released] = await db
    .update(resources)
    .set({ status: 'available', owner: null, runId: null, leaseUntil: null })
    .where(
      and(
        eq(resources.id, id),
        eq(resources.status, 'quarantined'),
        eq(resources.fencingToken, resource.fencingToken),
      ),
    )
    .returning();

  return released;
}

export function withLease<T>(lease: RunLease, job: () => Promise<T>) {
  return leaseScope.run(lease, job);
}
