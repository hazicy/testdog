import './environment';
import { runServiceProcess } from './serviceRuntime';
import { setTimeout as delay } from 'node:timers/promises';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { executeRun } from '@testdog/server/runs/run';
import { claimRun, registerResources, withLease } from '@testdog/server/scheduling/scheduler';
import { cancelRun } from '@testdog/server/runs/run';

const configSchema = z
  .array(
    z.strictObject({
      id: z.string().min(1),
      platform: z.enum(['web', 'android', 'ios']),
      profileId: z.string().min(1),
      deviceId: z.string().min(1).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  )
  .min(1);
const hostId = process.env.CASEFORGE_HOST_ID || hostname();
const workerId = `${hostId}:${process.pid}:${randomUUID()}`;
const configs = configSchema.parse(
  JSON.parse(
    process.env.CASEFORGE_RESOURCES ||
      JSON.stringify([{ id: `${hostId}:web:1`, platform: 'web', profileId: 'mobile' }]),
  ),
);

for (const resource of configs) {
  if (resource.platform !== 'web' && !resource.deviceId)
    throw new Error('Native resources require explicit deviceId');
  if (resource.platform === 'ios' && process.platform !== 'darwin')
    throw new Error('Local iOS worker requires macOS');
}

const concurrency = Number(process.env.CASEFORGE_WORKER_CONCURRENCY || configs.length);

if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > configs.length)
  throw new Error('Worker concurrency must be between 1 and the number of resources');

await runServiceProcess('worker', async ({ signal, stop }) => {
  const activeIds = new Set<string>();

  signal.addEventListener(
    'abort',
    () => {
      for (const id of activeIds) cancelRun(id);
    },
    { once: true },
  );
  await registerResources(configs.map((config) => ({ ...config, hostId })));
  if (signal.aborted) return;
  process.stdout.write(`Worker ${workerId} ready with ${configs.length} resources\n`);

  async function consume() {
    while (!signal.aborted) {
      const claimed = await claimRun(workerId, hostId);

      if (claimed) {
        activeIds.add(claimed.run.id);
        try {
          const execution = withLease(claimed.lease, () =>
            executeRun(claimed.run, claimed.resource),
          );

          // A signal may arrive while the database claim is in flight.
          if (signal.aborted) cancelRun(claimed.run.id);
          await execution;
        } catch (error) {
          process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        } finally {
          activeIds.delete(claimed.run.id);
        }
      } else {
        try {
          await delay(1000, undefined, { signal });
        } catch (error) {
          if (!signal.aborted) throw error;
        }
      }
    }
  }

  const results = await Promise.allSettled(
    Array.from({ length: concurrency }, () =>
      consume().catch((error) => {
        stop();
        throw error;
      }),
    ),
  );
  const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));

  if (errors.length) throw new AggregateError(errors, 'Worker consumers failed');
});
