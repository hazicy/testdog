import 'dotenv/config';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { executeRun } from '../src/workspace/server/run';
import {
  claimRun,
  recoverLeases,
  registerWorker,
  withLease,
} from '../src/workspace/server/scheduler';
import { pool } from '../src/db';
import { cancelRun } from '../src/workspace/server/run';

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
let stopping = false;
const activeIds = new Set<string>();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
    for (const id of activeIds) cancelRun(id);
  });
await registerWorker(
  workerId,
  hostId,
  configs.map((config) => ({ ...config, hostId })),
);
process.stdout.write(`Worker ${workerId} ready with ${configs.length} resources\n`);
const concurrency = Number(process.env.CASEFORGE_WORKER_CONCURRENCY || configs.length);
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > configs.length)
  throw new Error('Worker concurrency must be between 1 and the number of resources');

async function consume() {
  while (!stopping) {
    await recoverLeases();
    const claimed = await claimRun(workerId, hostId);
    if (claimed) {
      activeIds.add(claimed.run.id);
      try {
        await withLease(claimed.lease, () => executeRun(claimed.run, claimed.resource));
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      } finally {
        activeIds.delete(claimed.run.id);
      }
    } else {
      await registerWorker(workerId, hostId, []);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

try {
  await Promise.all(Array.from({ length: concurrency }, () => consume()));
} finally {
  await pool.end();
}
