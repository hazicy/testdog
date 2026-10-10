import type { RunStatus } from '@/features/runs/types';

export { recoverExpiredRuns, heartbeat, requestCancellation } from './repository';

export async function finishRun(id: string, status: RunStatus, error?: string) {
  const { getRun, finishRun } = await import('./repository');
  const run = await getRun(id);

  return finishRun(id, status, run.startedAt, error);
}
