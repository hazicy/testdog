import { WebTargetSchema } from '@testdog/contracts/automation/platform/target';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import type {
  ExecutionStep,
  RunArtifact,
  RunSummary,
  TestRun,
} from '@testdog/contracts/runs/types';

const timestamp = '2026-10-01T00:00:00Z';
const runId = '62534c46-a8eb-4991-993e-af6df14bece1';

export function makeCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: '62534c46-a8eb-4991-993e-af6df14bece0',
    name: '验证登录',
    url: 'https://example.com',
    goal: '验证登录按钮',
    tags: ['登录'],
    createdAt: timestamp,
    updatedAt: timestamp,
    target: WebTargetSchema.parse({
      platform: 'web',
      url: overrides.url ?? 'https://example.com',
      deviceProfile: 'legacy-desktop',
    }),
    ...overrides,
  };
}

export function makeStep(
  run: Pick<TestRun, 'id' | 'startedAt' | 'url'>,
  overrides: Partial<ExecutionStep> = {},
): ExecutionStep {
  return {
    id: '62534c46-a8eb-4991-993e-af6df14bece2',
    runId: run.id,
    sequence: 1,
    kind: 'navigate',
    title: '打开网站',
    status: 'passed',
    startedAt: run.startedAt,
    pageId: 'page-1',
    pageUrl: run.url,
    replayable: true,
    action: {
      platform: 'web',
      action: { type: 'navigate', value: run.url, target: { kind: 'css', value: '', name: '' } },
    },
    ...overrides,
  };
}

/** Defaults represent a completed recording; each scenario overrides its relevant fields. */
export function makeRun(overrides: Partial<TestRun> = {}, saved: TestCase = makeCase()): TestRun {
  const context = {
    id: overrides.id ?? runId,
    startedAt: overrides.startedAt ?? saved.createdAt,
    url: overrides.url ?? saved.url,
  };

  return {
    ...context,
    targetSnapshot: saved.target,
    testId: saved.id,
    name: saved.name,
    goal: saved.goal,
    mode: 'record',
    status: 'passed',
    finishedAt: saved.createdAt,
    durationMs: 1000,
    replayable: true,
    cancelRequested: false,
    events: [],
    artifacts: [],
    steps: [makeStep(context)],
    ...overrides,
  };
}

export function makeScreenshot(run: TestRun, overrides: Partial<RunArtifact> = {}): RunArtifact {
  return {
    id: 'frame',
    runId: run.id,
    kind: 'screenshot',
    stage: 'after',
    pageId: 'page-1',
    pageUrl: run.url,
    capturedAt: run.startedAt,
    elapsedMs: 1000,
    contentType: 'image/svg+xml',
    size: 100,
    ...overrides,
  };
}

export function summarizeRun(run: TestRun, overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: run.id,
    testId: run.testId,
    name: run.name,
    url: run.url,
    mode: run.mode,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    replayable: run.replayable,
    cancelRequested: run.cancelRequested,
    ...(run.error === undefined ? {} : { error: run.error }),
    ...(run.sourceRunId === undefined ? {} : { sourceRunId: run.sourceRunId }),
    ...overrides,
  };
}
