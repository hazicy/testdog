import type { Plan } from '@testdog/contracts/execution/plan';
import type { TestTarget } from '@testdog/contracts/execution/target';
import type {
  PlatformAction,
  PlatformAssertion,
  CapabilitySet,
  Observation,
  SessionEvent,
  ReplayStep,
} from '@testdog/contracts/execution/platform';

export type CheckResult = { passed: boolean; evidence: string; modelCallId?: string };

export type ReplayBinding = { action: PlatformAction; replayable: boolean };

export type CaptureRequest = {
  kind: 'screenshot' | 'video';
  path?: string;
};

export type ArtifactDescriptor = {
  kind: 'screenshot' | 'video';
  contentType: string;
  bytes: Uint8Array;
  producer: string;
  format: string;
};

export type ObservationRequest = { ref: string };

export interface AutomationSession {
  readonly id: string;
  readonly platform: TestTarget['platform'];
  readonly capabilities: CapabilitySet;
  readonly revision: number;
  readonly latestObservation?: Observation;
  readonly executionPolicy: { reobserveAfterAction: boolean };

  selectSurface?(id: string, signal: AbortSignal): Promise<void>;
  verifyPlugins?(signal: AbortSignal): Promise<void>;
  prepareReplayStep(step: ReplayStep, signal: AbortSignal): Promise<void>;
  observe(signal: AbortSignal, request?: ObservationRequest): Promise<Observation>;
  perform(action: PlatformAction, signal: AbortSignal): Promise<void | { evidence: string }>;
  wait(action: PlatformAction, signal: AbortSignal): Promise<Observation>;
  check(assertion: PlatformAssertion, signal: AbortSignal): Promise<CheckResult>;
  resolveForRecording(action: PlatformAction, observation: Observation): Promise<ReplayBinding>;
  capture(request: CaptureRequest, signal: AbortSignal): Promise<ArtifactDescriptor[]>;
  emit(event: SessionEvent): Promise<void>;
  close(): Promise<void>;
}

export interface ActionPlanner {
  plan(input: {
    goal: string;
    observation: Observation;
    capabilities: CapabilitySet;
    completedSteps: PlatformAction[];
    /** Observation used to choose each dispatched step, in the same order. */
    completedObservations?: Observation[];
    remainingWaitMs: number;
    previousFailure?: { reason: string; action?: PlatformAction };
  }): Promise<{
    done: boolean;
    steps: PlatformAction[];
    observe?: ObservationRequest;
    modelCallId?: string;
    toolCallIds?: string[];
  }>;
}

export type RunnerOptions = {
  plan: Plan;
  session: AutomationSession;
  planner: ActionPlanner;
  evaluator: Evaluator;
  signal: AbortSignal;
  report?: (message: string) => Promise<void>;
};

export interface Evaluator {
  evaluate(input: {
    subject: Record<string, unknown>;
    observation: Observation;
    name: string;
    signal: AbortSignal;
  }): Promise<CheckResult>;
}
