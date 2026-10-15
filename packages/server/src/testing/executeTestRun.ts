import { hostname } from 'node:os';
import type { TestRun } from '@testdog/contracts/runs/types';
import { executeRun } from '@testdog/server/runs/run';
import { claimRun, registerResources, withLease } from '@testdog/server/scheduling/scheduler';
import { owner } from '@testdog/server/shared/workerIdentity';

export async function executeTestRun(run: TestRun): Promise<void> {
  const hostId = process.env.TESTDOG_HOST_ID || hostname();

  await registerResources([
    { id: `${hostId}:web:inline`, hostId, platform: 'web', profileId: 'mobile' },
  ]);
  const claim = await claimRun(owner, hostId, run.id);

  if (!claim) throw new Error('没有匹配的可用执行资源');

  await withLease(claim.lease, () => executeRun(claim.run, claim.resource));
}
