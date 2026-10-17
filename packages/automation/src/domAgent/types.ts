import { z } from 'zod';

export const targetSchema = z.object({
  name: z.string().min(1).max(300),
  role: z.string().max(50).optional(),
  keywords: z.array(z.string().min(1).max(100)).max(20).default([]),
  context: z.array(z.string().min(1).max(100)).max(10).default([]),
});

export const conditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('url'), contains: z.string().min(1).max(1000) }),
  z.object({ kind: z.literal('visible'), target: targetSchema }),
  z.object({ kind: z.literal('value'), target: targetSchema, value: z.string().max(4000) }),
  z.object({ kind: z.literal('checked'), target: targetSchema, checked: z.boolean() }),
  z.object({ kind: z.literal('text'), value: z.string().min(1).max(1000) }),
]);

const elementActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('click'), target: targetSchema }),
  z.object({ kind: z.literal('hover'), target: targetSchema }),
  z.object({ kind: z.literal('press'), target: targetSchema, value: z.string().min(1).max(100) }),
  z.object({ kind: z.literal('fill'), target: targetSchema, value: z.string().max(4000) }),
  z.object({ kind: z.literal('select'), target: targetSchema, value: z.string().max(300) }),
  z.object({ kind: z.literal('check'), target: targetSchema, checked: z.boolean() }),
]);

export const actionSchema = z.union([
  elementActionSchema,
  z.object({ kind: z.literal('navigate'), url: z.string().url() }),
  z.object({ kind: z.literal('scroll'), direction: z.enum(['up', 'down']) }),
  z.object({ kind: z.literal('wait') }),
]);

export const planSchema = z.object({
  steps: z
    .array(
      z.object({
        goal: z.string().min(1).max(500),
        action: actionSchema,
        expected: conditionSchema,
      }),
    )
    .max(30),
  completion: z.array(conditionSchema).min(1).max(10),
});

export type Target = z.infer<typeof targetSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Action = z.infer<typeof actionSchema>;
export type Step = z.infer<typeof planSchema>['steps'][number];
export type Plan = z.infer<typeof planSchema>;
export type Candidate = {
  id: string;
  tag: string;
  role: string;
  name: string;
  text: string;
  context: string;
  href: string;
  inputType: string;
  editable: boolean;
  enabled: boolean;
  inViewport: boolean;
  frameUrl: string;
};
export type RankedCandidate = Candidate & { score: number };
export type Decision = (
  | { kind: 'element'; id: string }
  | {
      kind: 'fallback';
      reason: 'none' | 'need_scroll' | 'need_replan' | 'wait' | 'uncertain';
    }
) & { modelCallId?: string };
export type Event = {
  goal: string;
  phase: 'selected' | 'verified' | 'retry' | 'uncertain' | 'replan';
  detail: string;
};
export type PlanningState = {
  task: string;
  url: string;
  candidates: Candidate[];
  history: Event[];
  failure?: string;
  completion?: Condition[];
};
export type Planner = (state: PlanningState, signal: AbortSignal) => Promise<Plan>;
export type Chooser = (
  step: Step,
  candidates: RankedCandidate[],
  url: string,
  signal: AbortSignal,
) => Promise<Decision>;
