import type { TestCase } from '@testdog/contracts/test-cases/types';
import type { RunSummary, RunStatus } from '@testdog/contracts/runs/types';

export type TestSuite = {
  id: string;
  name: string;
  parentId: string | null;
  position: number;
  totalTestCount: number;
  version: number;
  testCount: number;
  updatedAt: string;
};
export type SuiteTreeCase = Pick<TestCase, 'id' | 'name'> & { latestStatus?: RunStatus };
export type SuiteTreeNode = TestSuite & { tests: SuiteTreeCase[] };
export type FolderTree = { folders: SuiteTreeNode[]; rootTests: SuiteTreeCase[] };
export type SuiteDetail = TestSuite & { tests: TestCase[]; folders: TestSuite[] };
export type SuiteRunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'cancelled';
export type SuiteRunSummary = {
  id: string;
  suiteId: string | null;
  name: string;
  createdAt: string;
  total: number;
  cancelRequested: boolean;
  counts: Record<RunStatus, number>;
  status: SuiteRunStatus;
};
export type SuiteRunDetail = SuiteRunSummary & { runs: RunSummary[] };

export function suiteRunStatus(counts: Record<RunStatus, number>): SuiteRunStatus {
  const finished = counts.passed + counts.failed + counts.cancelled;

  if (
    counts.preparing + counts.running + counts.finalizing > 0 ||
    (counts.queued > 0 && finished > 0)
  )
    return 'running';
  if (counts.queued > 0) return 'queued';
  if (counts.failed > 0) return 'failed';
  if (counts.cancelled > 0) return 'cancelled';

  return 'passed';
}
