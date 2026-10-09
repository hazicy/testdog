import type { Assertion, Plan, Step, Target } from '@/automation/compiler/schema';
export type TestCase = {
  id: string;
  name: string;
  url: string;
  goal: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};
export type RunStatus = 'running' | 'passed' | 'failed' | 'cancelled';
export type RunEvent = { at: string; message: string };
export type RecordedAction = Step & { sensitive?: boolean };
export type PlaywrightAssertion = {
  target?: Target;
  type: 'toBeVisible' | 'toHaveText' | 'toContainText' | 'toHaveValue' | 'toHaveURL';
  value?: string;
  negate?: boolean;
};
export type ExecutionStep = {
  id: string;
  runId: string;
  sequence: number;
  kind: 'navigate' | 'action' | 'assertion' | 'wait' | 'branch';
  title: string;
  status: 'running' | 'passed' | 'failed';
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  pageId: string;
  pageUrl: string;
  planNodeId?: string;
  action?: RecordedAction;
  assertion?: Assertion;
  playwrightAssertion?: PlaywrightAssertion;
  condition?: string;
  decision?: boolean;
  evidence?: string;
  error?: string;
  replayable: boolean;
};
export type RunArtifact = {
  id: string;
  runId: string;
  stepId?: string;
  kind: 'screenshot' | 'video' | 'trace';
  stage: 'before' | 'after' | 'live' | 'final';
  pageId: string;
  pageUrl: string;
  capturedAt: string;
  elapsedMs: number;
  contentType: string;
  size: number;
};
export type TestRun = {
  id: string;
  testId?: string;
  name: string;
  url: string;
  goal: string;
  mode: 'record' | 'replay';
  sourceRunId?: string;
  recordingVersionId?: string;
  recordingSteps?: ExecutionStep[];
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  events: RunEvent[];
  plan?: Plan;
  replayable: boolean;
  cancelRequested: boolean;
  steps: ExecutionStep[];
  artifacts: RunArtifact[];
};
/** Fields required by history rows and the case library's latest-run status. */
export type RunSummary = Pick<
  TestRun,
  | 'id'
  | 'testId'
  | 'name'
  | 'url'
  | 'mode'
  | 'status'
  | 'startedAt'
  | 'finishedAt'
  | 'durationMs'
  | 'error'
  | 'sourceRunId'
  | 'replayable'
  | 'cancelRequested'
>;
export type StepSignal = {
  id: string;
  phase: 'start' | 'finish' | 'error';
  planNodeId?: string;
  kind: ExecutionStep['kind'];
  title: string;
  action?: Step;
  assertion?: Assertion;
  playwrightAssertion?: PlaywrightAssertion;
  condition?: string;
  decision?: boolean;
  evidence?: string;
  error?: string;
};
export type ExecutionHooks = {
  signal?: AbortSignal;
  onPage?: (page: import('playwright').Page) => void;
  onStep?: (event: StepSignal, page: import('playwright').Page) => Promise<void>;
};

export type RecordingVersion = {
  id: string;
  runId: string;
  code: string;
  createdAt: string;
};
