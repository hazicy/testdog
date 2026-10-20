import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import { realtimeOutbox, testRuns } from '@testdog/server/db/schema';
import { assertRunAccess, getRun } from '@testdog/server/runs/repository';
import { ownedBy, workspaceChannel, type UserScope } from '@testdog/server/shared/ownership';
import { requireUserId } from '@/server/shared/auth';
import { isActiveRun } from '@testdog/contracts/runs/types';
import { readyRedis, redisClient } from '@testdog/server/infrastructure/redis';
import { latestPreview, watchPreview } from '@testdog/server/realtime/preview';
import {
  readRunUpdates,
  startOutboxPublisher,
  subscribeRealtime,
} from '@testdog/server/realtime/events';

export async function workspaceVersion(userId: UserScope) {
  const [row] = await db
    .select({ version: sql<string>`concat(count(*), ':', coalesce(sum(${realtimeOutbox.id}), 0))` })
    .from(realtimeOutbox)
    .where(and(eq(realtimeOutbox.summary, true), ownedBy(realtimeOutbox, userId)));

  return row.version;
}

export async function eventStream(request: Request, runId: string | undefined, userId: UserScope) {
  if (runId) await assertRunAccess(runId, userId);
  startOutboxPublisher();
  redisClient(true);
  await readyRedis();
  await readyRedis(true);
  const viewer = randomUUID();
  const watching = !!runId && new URL(request.url).searchParams.get('preview') === '1';
  let closed = false;
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let revision = 0;
  let initialized = false;
  let busy = false;
  let dirty = false;
  let workspaceCursor = '';
  let previewVersion = '';
  let issueVersion = 0;
  const encoder = new TextEncoder();
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(debounce);
    unsubscribe?.();
    request.signal.removeEventListener('abort', close);
    if (runId && watching) void watchPreview(runId, viewer, false).catch(() => {});
  };

  const close = () => {
    cleanup();
    try {
      controller.close();
    } catch {
      /* Reader already cancelled. */
    }
  };

  const send = (event: string, data: unknown, id?: number) => {
    if (closed) return;
    if ((controller.desiredSize ?? 0) < -32) {
      close();

      return;
    }

    controller.enqueue(
      encoder.encode(
        `${id === undefined ? '' : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
      ),
    );
  };

  const snapshot = async () => {
    const run = await getRun(runId!, { userId });

    revision = run.realtimeRevision ?? 0;
    send('snapshot', { run }, revision);

    return run;
  };

  const sync = async () => {
    if (closed || !initialized) return;
    if (busy) {
      dirty = true;

      return;
    }

    busy = true;
    try {
      do {
        dirty = false;
        // Recheck the session so logout and session expiry also close existing streams.
        if ((await requireUserId(request)) !== userId) {
          close();

          return;
        }

        await readyRedis();
        await readyRedis(true);
        if (closed) return;
        if (runId) {
          const [row] = await db
            .select({
              revision: testRuns.realtimeRevision,
              status: testRuns.status,
              issueVersion: sql<number>`(select coalesce(max(id), 0)::float8 from realtime_outbox where "runId" = ${runId} and kind = 'issues')`,
            })
            .from(testRuns)
            .where(and(eq(testRuns.id, runId), ownedBy(testRuns, userId)));

          if (!row) {
            close();

            return;
          }

          if (row.issueVersion !== issueVersion) {
            issueVersion = row.issueVersion;
            send('changed', {});
          }

          if (row.revision > revision) {
            const updates = await readRunUpdates(runId, revision);

            // Retention gaps require an authoritative snapshot, not a partial replay.
            if (
              !updates.length ||
              updates[0].revision !== revision + 1 ||
              updates.some((update, index) => update.revision !== revision + index + 1)
            )
              await snapshot();
            else {
              revision = updates.at(-1)!.revision;
              send('updates', updates, revision);
              if (revision < row.revision) dirty = true;
            }
          }

          if (watching && isActiveRun(row.status)) {
            await watchPreview(runId, viewer, true);
            if (closed) {
              await watchPreview(runId, viewer, false);

              return;
            }

            const preview = await latestPreview(runId);

            if (preview && preview.version !== previewVersion) {
              previewVersion = preview.version;
              send('preview', preview);
            }
          }

          if (!isActiveRun(row.status) && revision >= row.revision) {
            send('done', {});
            close();
          }
        } else {
          const version = await workspaceVersion(userId);

          if (workspaceCursor !== version) {
            workspaceCursor = version;
            send('changed', {});
          }
        }
      } while (dirty && !closed);
    } catch {
      close();
    } finally {
      busy = false;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(output) {
      controller = output;
      request.signal.addEventListener('abort', close, { once: true });
      if (request.signal.aborted) {
        close();

        return;
      }

      void (async () => {
        try {
          const release = await subscribeRealtime(
            runId ? `run:${runId}` : workspaceChannel(userId),
            (message) => {
              const event = JSON.parse(message);

              if (event.kind === 'preview') {
                if (watching && initialized && event.version !== previewVersion) {
                  previewVersion = event.version;
                  send('preview', event);
                }

                return;
              }

              if (!initialized) {
                dirty = true;

                return;
              }

              clearTimeout(debounce);
              debounce = setTimeout(() => void sync(), 250);
            },
          );

          if (closed) {
            release();

            return;
          }

          unsubscribe = release;
          if (runId) await snapshot();
          else {
            workspaceCursor = await workspaceVersion(userId);
            send('changed', {});
          }

          initialized = true;
          send('ready', {});
          await sync();
          if (closed) return;
          heartbeat = setInterval(() => {
            if ((controller.desiredSize ?? 0) < -32) {
              close();

              return;
            }

            if (!closed) controller.enqueue(encoder.encode(': heartbeat\n\n'));
            void sync();
          }, 15000);
        } catch {
          close();
        }
      })();
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'private, no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
