import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { realtimeOutbox, runArtifacts, runSteps, testRuns } from '@/db/schema';
import { artifactRecord, runRecord, stepRecord } from '@/server/runs/repository';
import { readyRedis, redisClient, redisKey } from '@/server/shared/redis';
import type { RunUpdate } from '@/features/runs/lib/realtime';

type Listener = (message: string) => void;
const state = globalThis as typeof globalThis & {
  caseforgeRealtime?: {
    listeners: Map<string, Set<Listener>>;
    subscribed?: Promise<void>;
    publisher?: ReturnType<typeof setInterval>;
    busy: boolean;
    cleanedAt: number;
  };
};
const shared: NonNullable<typeof state.caseforgeRealtime> = (state.caseforgeRealtime ??= {
  listeners: new Map(),
  busy: false,
  cleanedAt: 0,
});

// PostgreSQL owns reliability; Redis carries only wake-ups after committed writes.
export async function flushOutbox() {
  if (shared.busy) return;
  shared.busy = true;
  try {
    if (Date.now() - shared.cleanedAt > 60000) {
      await db.delete(realtimeOutbox).where(sql`
        ${realtimeOutbox.publishedAt} < now() - interval '1 hour'
        OR ${realtimeOutbox.createdAt} < now() - interval '24 hours'
      `);
      shared.cleanedAt = Date.now();
    }
    const client = await readyRedis();

    await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(realtimeOutbox)
        .where(sql`${realtimeOutbox.publishedAt} is null`)
        .orderBy(asc(realtimeOutbox.id))
        .limit(200)
        .for('update', { skipLocked: true });
      const runs = new Set(rows.flatMap((row) => (row.runId ? [row.runId] : [])));
      for (const id of runs) await client.publish(redisKey(`run:${id}`), '{"kind":"changed"}');
      if (rows.some((row) => row.summary))
        await client.publish(redisKey('workspace'), JSON.stringify({ kind: 'changed' }));
      for (const row of rows)
        await tx
          .update(realtimeOutbox)
          .set({ publishedAt: new Date().toISOString() })
          .where(eq(realtimeOutbox.id, row.id));
    });
  } catch {
    // Recent unpublished rows remain durable; retention gaps recover from snapshots.
  } finally {
    shared.busy = false;
  }
}

export function startOutboxPublisher() {
  if (shared.publisher) return;
  if (process.env.REDIS_URL) redisClient();
  shared.publisher = setInterval(() => void flushOutbox(), 500);
  shared.publisher.unref();
}

export function stopOutboxPublisher() {
  clearInterval(shared.publisher);
  shared.publisher = undefined;
}

export async function subscribeRealtime(channel: string, listener: Listener) {
  const client = await readyRedis(true);

  shared.subscribed ??= (async () => {
    const dispatch = (message: string, topic: string) => {
      for (const callback of shared.listeners.get(topic) ?? []) callback(message);
    };

    await client.pSubscribe(redisKey('run:*'), dispatch);
    await client.subscribe(redisKey('workspace'), (message) =>
      dispatch(message, redisKey('workspace')),
    );
  })().catch((error) => {
    shared.subscribed = undefined;
    throw error;
  });
  await shared.subscribed;
  const topic = redisKey(channel);
  const listeners = shared.listeners.get(topic) ?? new Set<Listener>();

  listeners.add(listener);
  shared.listeners.set(topic, listeners);

  return () => {
    listeners.delete(listener);
    if (!listeners.size) shared.listeners.delete(topic);
  };
}

export async function readRunUpdates(runId: string, revision: number): Promise<RunUpdate[]> {
  const rows = await db
    .select()
    .from(realtimeOutbox)
    .where(and(eq(realtimeOutbox.runId, runId), gt(realtimeOutbox.revision, revision)))
    .orderBy(asc(realtimeOutbox.revision))
    .limit(200);

  return rows.map((row): RunUpdate => {
    const revision = row.revision!;
    if (row.kind === 'run') {
      const {
        steps: _steps,
        artifacts: _artifacts,
        browserLogs: _logs,
        ...data
      } = runRecord(row.data as typeof testRuns.$inferSelect);

      void _steps;
      void _artifacts;
      void _logs;

      return { kind: 'run', revision, data };
    }
    if (row.kind === 'step')
      return { kind: 'step', revision, data: stepRecord(row.data as typeof runSteps.$inferSelect) };
    if (row.kind === 'artifact')
      return {
        kind: 'artifact',
        revision,
        data: artifactRecord(row.data as typeof runArtifacts.$inferSelect),
      };

    return {
      kind: 'log',
      revision,
      data: row.data.data as import('@/features/runs/types').BrowserLog,
    };
  });
}
