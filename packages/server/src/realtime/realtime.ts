import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import { realtimeOutbox, runArtifacts, runSteps, testRuns } from '@testdog/server/db/schema';
import { artifactRecord, runRecord, stepRecord } from '@testdog/server/runs/records';
import { readyRedis, redisClient, redisKey } from '@testdog/server/shared/redis';
import type { RunUpdate } from '@testdog/contracts/runs/lib/realtime';
import { workspaceChannel } from '@testdog/server/shared/ownership';

type Listener = (message: string) => void;
const state = globalThis as typeof globalThis & {
  caseforgeRealtime?: {
    listeners: Map<string, Set<Listener>>;
    subscribed?: Promise<void>;
    publisher?: ReturnType<typeof setInterval>;
    pending?: Promise<void>;
    cleanedAt: number;
  };
};
const shared: NonNullable<typeof state.caseforgeRealtime> = (state.caseforgeRealtime ??= {
  listeners: new Map(),
  cleanedAt: 0,
});

// PostgreSQL owns reliability; Redis carries only wake-ups after committed writes.
export function flushOutbox(): Promise<void> {
  if (shared.pending) return shared.pending;
  shared.pending = publishOutbox().finally(() => {
    shared.pending = undefined;
  });

  return shared.pending;
}

async function publishOutbox() {
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
        .select({
          id: realtimeOutbox.id,
          runId: realtimeOutbox.runId,
          userId: realtimeOutbox.userId,
          summary: realtimeOutbox.summary,
        })
        .from(realtimeOutbox)
        .where(sql`${realtimeOutbox.publishedAt} is null`)
        .orderBy(asc(realtimeOutbox.id))
        .limit(200)
        .for('update', { skipLocked: true });

      if (!rows.length) return;
      const runs = new Set(rows.flatMap((row) => (row.runId ? [row.runId] : [])));

      for (const id of runs) await client.publish(redisKey(`run:${id}`), '{"kind":"changed"}');
      const owners = new Set(rows.filter((row) => row.summary).map((row) => row.userId));

      for (const userId of owners)
        await client.publish(
          redisKey(workspaceChannel(userId)),
          JSON.stringify({ kind: 'changed' }),
        );
      await tx
        .update(realtimeOutbox)
        .set({ publishedAt: new Date().toISOString() })
        .where(
          inArray(
            realtimeOutbox.id,
            rows.map((row) => row.id),
          ),
        );
    });
  } catch {
    // Recent unpublished rows remain durable; retention gaps recover from snapshots.
  }
}

export function startOutboxPublisher() {
  if (shared.publisher) return;
  if (process.env.REDIS_URL) redisClient();
  shared.publisher = setInterval(() => void flushOutbox(), 500);
  shared.publisher.unref();
}

export async function stopOutboxPublisher() {
  clearInterval(shared.publisher);
  shared.publisher = undefined;
  await shared.pending;
}

export async function subscribeRealtime(channel: string, listener: Listener) {
  const client = await readyRedis(true);

  shared.subscribed ??= (async () => {
    const dispatch = (message: string, topic: string) => {
      for (const callback of shared.listeners.get(topic) ?? []) callback(message);
    };

    await client.pSubscribe(redisKey('run:*'), dispatch);
    await client.pSubscribe(redisKey('workspace:*'), dispatch);
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
        events: _events,
        ...data
      } = runRecord(row.data as typeof testRuns.$inferSelect);

      void _steps;
      void _artifacts;
      void _events;

      return { kind: 'run', revision, data };
    }

    if (row.kind === 'event')
      return {
        kind: 'event',
        revision,
        data: {
          at: new Date(row.data.at as string).toISOString(),
          message: row.data.message as string,
        },
      };

    if (row.kind === 'step')
      return { kind: 'step', revision, data: stepRecord(row.data as typeof runSteps.$inferSelect) };
    if (row.kind === 'artifact')
      return {
        kind: 'artifact',
        revision,
        data: artifactRecord(row.data as typeof runArtifacts.$inferSelect),
      };

    return {
      kind: 'logs',
      revision,
    };
  });
}
