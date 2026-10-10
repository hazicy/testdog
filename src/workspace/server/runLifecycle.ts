import { randomUUID } from 'node:crypto';
import type { RunStatus } from '../types';

const state = globalThis as typeof globalThis & { caseforgeWorkerId?: string };
export const owner = (state.caseforgeWorkerId ??= randomUUID());

export { recoverExpiredRuns, heartbeat, requestCancellation } from './store';
export async function finishRun(id: string, status: RunStatus, error?: string) {
  const { getRun, finishRun } = await import('./store');
  const run = await getRun(id);
  return finishRun(id, status, run.startedAt, error);
}
