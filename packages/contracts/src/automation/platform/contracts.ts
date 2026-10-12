import { z } from 'zod';
import { StepSchema, TargetSchema } from '@testdog/contracts/automation/compiler/schema';
import type { Assertion, Plan } from '@testdog/contracts/automation/compiler/schema';
import type { TestTarget } from '@testdog/contracts/automation/platform/target';

export const NativeLocatorSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('ref'),
    value: z.string().min(1),
    revision: z.number().int().positive(),
  }),
  z.strictObject({ kind: z.literal('identifier'), value: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('label'),
    value: z.string().min(1),
    role: z.string().optional(),
  }),
]);
export const NativeActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('tap'), target: NativeLocatorSchema }),
  z.strictObject({ type: z.literal('fill'), target: NativeLocatorSchema, value: z.string() }),
  z.strictObject({ type: z.literal('back') }),
  z.strictObject({ type: z.literal('screenshot') }),
  z.strictObject({ type: z.literal('swipe'), direction: z.enum(['up', 'down', 'left', 'right']) }),
  z.strictObject({
    type: z.literal('wait'),
    text: z.string().min(1),
    timeoutMs: z.number().int().min(1000).max(5000),
  }),
]);
export const PlatformActionSchema = z.discriminatedUnion('platform', [
  z.strictObject({
    schemaVersion: z.literal(1).optional(),
    platform: z.literal('web'),
    action: StepSchema.and(z.object({ sensitive: z.boolean().optional() })),
  }),
  z.strictObject({
    schemaVersion: z.literal(1).optional(),
    platform: z.literal('android'),
    action: NativeActionSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(1).optional(),
    platform: z.literal('ios'),
    action: NativeActionSchema,
  }),
]);
export type PlatformAction = z.infer<typeof PlatformActionSchema>;
export type NativeAction = z.infer<typeof NativeActionSchema>;
export type NativeLocator = z.infer<typeof NativeLocatorSchema>;
export const CapabilitySetSchema = z.strictObject({
  actions: z.array(z.string().min(1)).max(100),
  artifacts: z.array(z.string().min(1)).max(100),
  assertions: z.array(z.string().min(1)).max(100),
  observations: z.array(z.string().min(1)).max(100).optional(),
});
export type CapabilitySet = z.infer<typeof CapabilitySetSchema>;
export const ObservationSchema = z
  .object({
    schemaVersion: z.literal(1),
    sessionId: z.string().min(1),
    revision: z.number().int().nonnegative(),
    capturedAt: z.iso.datetime(),
    surface: z.strictObject({
      id: z.string().min(1),
      platform: z.enum(['web', 'android', 'ios']),
      url: z.string().optional(),
      appId: z.string().optional(),
    }),
  })
  .passthrough();
export type Observation = Record<string, unknown> & {
  schemaVersion: 1;
  sessionId: string;
  revision: number;
  capturedAt: string;
  surface: { id: string; platform: TestTarget['platform']; url?: string; appId?: string };
};
export const PlatformAssertionSchema = z
  .discriminatedUnion('platform', [
    z.strictObject({
      platform: z.literal('web'),
      type: z.enum(['visible', 'text', 'containsText', 'value', 'url']),
      negate: z.boolean().optional(),
      target: TargetSchema.optional(),
      value: z.string().optional(),
    }),
    z.strictObject({
      platform: z.literal('android'),
      type: z.enum(['visible', 'text', 'value']),
      target: NativeLocatorSchema,
      value: z.string().optional(),
    }),
    z.strictObject({
      platform: z.literal('ios'),
      type: z.enum(['visible', 'text', 'value']),
      target: NativeLocatorSchema,
      value: z.string().optional(),
    }),
  ])
  .superRefine((assertion, ctx) => {
    if (assertion.type !== 'visible' && assertion.value === undefined)
      ctx.addIssue({ code: 'custom', message: 'This assertion requires an expected value' });
    if (assertion.platform === 'web' && assertion.type !== 'url' && !assertion.target)
      ctx.addIssue({ code: 'custom', message: 'This assertion requires a target' });
  });
export type PlatformAssertion = z.infer<typeof PlatformAssertionSchema>;
export type CheckResult = { passed: boolean; evidence: string };
export type ReplayBinding = { action: PlatformAction; replayable: boolean };
export type CaptureRequest = {
  kind: 'screenshot' | 'snapshot' | 'video' | 'device-trace' | 'log';
  path?: string;
};
export type ArtifactDescriptor = {
  kind: 'screenshot' | 'snapshot' | 'video' | 'device-trace' | 'log';
  contentType: string;
  bytes: Uint8Array;
  producer: string;
  format: string;
};

export type SessionEvent = {
  id: string;
  phase: 'start' | 'finish' | 'error';
  kind: 'navigate' | 'action' | 'wait' | 'assertion' | 'branch';
  title: string;
  planNodeId?: string;
  action?: PlatformAction;
  assertion?: Assertion;
  platformAssertion?: PlatformAssertion;
  condition?: string;
  decision?: boolean;
  evidence?: string;
  error?: string;
};

export type ReplayStep = {
  surfaceId?: string;
  event: Omit<SessionEvent, 'id' | 'phase'>;
};

export interface AutomationSession {
  readonly id: string;
  readonly platform: TestTarget['platform'];
  readonly capabilities: CapabilitySet;
  readonly revision: number;
  readonly latestObservation?: Observation;
  readonly executionPolicy: { reobserveAfterAction: boolean };

  selectSurface?(id: string, signal: AbortSignal): Promise<void>;
  prepareReplayStep(step: ReplayStep, signal: AbortSignal): Promise<void>;
  observe(signal: AbortSignal): Promise<Observation>;
  perform(action: PlatformAction, signal: AbortSignal): Promise<void>;
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
    remainingWaitMs: number;
  }): Promise<{ done: boolean; steps: PlatformAction[] }>;
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
