import type { RunStatus } from '@testdog/contracts/runs/types';

export function emptyRunCounts(): Record<RunStatus, number> {
  return {
    queued: 0,
    preparing: 0,
    running: 0,
    finalizing: 0,
    passed: 0,
    failed: 0,
    cancelled: 0,
  };
}

export type WorkspaceStats = {
  testCount: number;
  runCount: number;
  counts: Record<RunStatus, number>;
};
