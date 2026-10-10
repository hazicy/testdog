import { AsyncLocalStorage } from 'node:async_hooks';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { testRuns } from '@/db/schema';
import { activeRunStatuses } from '@/features/runs/types';

export type RunLease = { runId: string; workerId: string; fencingToken: number };
export const leaseScope = new AsyncLocalStorage<RunLease>();
export class LostLeaseError extends Error {}

// Lock run while checking ownership and committing evidence: reclamation cannot race the write.
export async function runWrite<T>(
  runId: string,
  operation: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select({
        workerId: testRuns.workerId,
        fencingToken: testRuns.fencingToken,
        leaseUntil: testRuns.leaseUntil,
        status: testRuns.status,
      })
      .from(testRuns)
      .where(eq(testRuns.id, runId))
      .for('update');

    if (!run) throw new LostLeaseError('Run no longer exists');
    if (!run.workerId) throw new LostLeaseError('Run has not been claimed by a worker');
    const lease = leaseScope.getStore();

    if (run.workerId) {
      if (
        !lease ||
        lease.runId !== runId ||
        lease.workerId !== run.workerId ||
        lease.fencingToken !== run.fencingToken ||
        !run.leaseUntil ||
        Date.parse(run.leaseUntil) <= Date.now() ||
        !activeRunStatuses.includes(run.status)
      )
        throw new LostLeaseError('Execution lease lost');
    }

    return operation(tx);
  });
}

export async function setRunPhase(
  runId: string,
  phase: 'running' | 'finalizing',
  environmentSnapshot?: Record<string, unknown>,
  capabilities?: import('@/automation/platform/contracts').CapabilitySet,
) {
  await runWrite(runId, async (tx) => {
    await tx
      .update(testRuns)
      .set({
        status: phase,
        ...(phase === 'running'
          ? { executingAt: new Date().toISOString() }
          : { finalizingAt: new Date().toISOString() }),
        ...(environmentSnapshot ? { environmentSnapshot } : {}),
        ...(capabilities ? { capabilities } : {}),
      })
      .where(
        and(
          eq(testRuns.id, runId),
          inArray(testRuns.status, ['preparing', 'running', 'finalizing']),
        ),
      );
  });
}
