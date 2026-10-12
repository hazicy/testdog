import type {
  PlatformAction,
  PlatformAssertion,
  Observation,
  CapabilitySet,
} from '@/automation/platform/contracts';
import type { RecordedAction } from '@/automation/platform/web/types';
import type { TestTarget } from '@/automation/platform/target';
import type { Assertion, Plan, Step, Target } from '@/automation/compiler/schema';

export type RunStatus =
  'queued' | 'preparing' | 'running' | 'finalizing' | 'passed' | 'failed' | 'cancelled';
export const activeRunStatuses: RunStatus[] = ['queued', 'preparing', 'running', 'finalizing'];
export const isActiveRun = (status: RunStatus) => activeRunStatuses.includes(status);
export type RunEvent = { at: string; message: string };
export type PlaywrightAssertion = {
  target?: Target;
  type: 'toBeVisible' | 'toHaveText' | 'toContainText' | 'toHaveValue' | 'toHaveURL';
  value?: string;
  negate?: boolean;
};
export type ExecutionStep = {
  platformAction?: PlatformAction;
  surface?: Observation['surface'];
  observationRevision?: number;
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
  platformAssertion?: PlatformAssertion;
  playwrightAssertion?: PlaywrightAssertion;
  condition?: string;
  decision?: boolean;
  evidence?: string;
  error?: string;
  replayable: boolean;
};
export type RunArtifact = {
  surface?: Observation['surface'];
  producer?: string;
  format?: string;
  id: string;
  runId: string;
  stepId?: string;
  kind: 'screenshot' | 'video' | 'trace' | 'snapshot' | 'log' | 'device-trace';
  stage: 'before' | 'after' | 'live' | 'final';
  pageId: string;
  pageUrl: string;
  capturedAt: string;
  elapsedMs: number;
  contentType: string;
  size: number;
};
export type BrowserLog = {
  id: string;
  kind: 'console' | 'network';
  at: string;
  elapsedMs: number;
  pageId: string;
  pageUrl: string;
  stepId?: string;
  level?: string;
  message?: string;
  url?: string;
  method?: string;
  resourceType?: string;
  status?: number;
  durationMs?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  failure?: string;
};
export type TestRun = {
  realtimeRevision?: number;
  browserLogRevision?: number;
  workerId?: string;
  resourceId?: string;
  batchId?: string;
  fencingToken?: number;
  attempt?: number;
  errorCode?: string;

  targetSnapshot?: TestTarget;
  environmentSnapshot?: Record<string, unknown>;
  replayEnvironmentSnapshot?: Record<string, unknown>;
  capabilities?: CapabilitySet;
  evidenceComplete?: boolean;
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
  browserLogs?: BrowserLog[];
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
  platformAssertion?: PlatformAssertion;
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
  schemaVersion?: number;
  platform?: TestTarget['platform'];
  targetSnapshot?: TestTarget;
  id: string;
  runId: string;
  code: string;
  createdAt: string;
};
