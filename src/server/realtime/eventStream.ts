import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { realtimeOutbox, testRuns } from '@/db/schema';
import { getRun } from '@/server/runs/repository';
import { isActiveRun } from '@/features/runs/types';
import { readyRedis, redisClient } from '@/server/shared/redis';
import { latestPreview, watchPreview } from './preview';
import {
  readRunUpdates,
  recoverRealtimeLeases,
  startOutboxPublisher,
  subscribeRealtime,
} from './realtime';

async function workspaceVersion() {
  const [row] = await db
    .select({ version: sql<string>`concat(count(*), ':', coalesce(sum(${realtimeOutbox.id}), 0))` })
    .from(realtimeOutbox)
    .where(eq(realtimeOutbox.summary, true));

  return row.version;
}

export async function eventStream(request: Request, runId?: string) {
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
    const run = await getRun(runId!);

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
        await readyRedis();
        await readyRedis(true);
        await recoverRealtimeLeases();
        if (closed) return;
        if (runId) {
          const [row] = await db
            .select({ revision: testRuns.realtimeRevision, status: testRuns.status })
            .from(testRuns)
            .where(eq(testRuns.id, runId));
          if (!row) {
            close();

            return;
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
          const version = await workspaceVersion();
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
            runId ? `run:${runId}` : 'workspace',
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
            workspaceCursor = await workspaceVersion();
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
