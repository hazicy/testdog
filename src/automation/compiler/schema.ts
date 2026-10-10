import { z } from 'zod';

export const TargetSchema = z.object({
  kind: z.enum(['role', 'label', 'placeholder', 'testId', 'css', 'text', 'ariaRef']),
  value: z.string(),
  name: z.string().default(''),
  index: z.number().int().nonnegative().optional(),
});

const ActionStepSchema = z.object({
  type: z.enum(['navigate', 'click', 'fill', 'press']),
  target: TargetSchema,
  value: z.string(),
});

export const WaitStepSchema = z.object({
  type: z.literal('wait'),
  condition: z.enum(['observe', 'newPage', 'url', 'text']),
  value: z.string(),
  timeoutMs: z.number().int().min(1000).max(5000),
});
export const StepSchema = z.discriminatedUnion('type', [ActionStepSchema, WaitStepSchema]);
export type WaitStep = z.infer<typeof WaitStepSchema>;

const id = z.string().trim().min(1);
const ids = z.array(id);
export const NodeSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('group'), id, goal: id, children: ids.min(1), dependsOn: ids })
    .strict(),
  z
    .object({
      kind: z.literal('task'),
      id,
      goal: id,
      dependsOn: ids,
      requirementIds: ids,
      assertions: z.array(z.object({ description: id }).strict()),
    })
    .strict(),
  z
    .object({
      kind: z.literal('branch'),
      id,
      condition: id,
      then: id,
      otherwise: id.optional(),
      dependsOn: ids,
    })
    .strict(),
]);
export const PlanSchema = z
  .object({ rootId: id, nodes: z.record(id, NodeSchema) })
  .strict()
  .superRefine((plan, ctx) => {
    const error = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (!Object.hasOwn(plan.nodes, plan.rootId)) error(`Missing root node: ${plan.rootId}`);
    for (const [key, node] of Object.entries(plan.nodes)) {
      if (key !== node.id) error(`Node key ${key} does not match id ${node.id}`);
      const refs = nodeReferences(node);
      for (const ref of refs) if (!Object.hasOwn(plan.nodes, ref)) error(`Missing node: ${ref}`);
    }
    const active = new Set<string>();
    const visited = new Set<string>();
    const visit = (key: string) => {
      if (active.has(key)) {
        error(`Cycle detected at node: ${key}`);

        return;
      }
      if (visited.has(key) || !Object.hasOwn(plan.nodes, key)) return;
      active.add(key);
      const node = plan.nodes[key];
      const refs = nodeReferences(node);

      refs.forEach(visit);
      active.delete(key);
      visited.add(key);
    };

    Object.keys(plan.nodes).forEach(visit);
  });

function nodeReferences(node: PlanNode): string[] {
  const children =
    node.kind === 'group'
      ? node.children
      : node.kind === 'branch'
        ? [node.then, ...(node.otherwise ? [node.otherwise] : [])]
        : [];

  return [...node.dependsOn, ...children];
}

export type Target = z.infer<typeof TargetSchema>;
export type Step = z.infer<typeof StepSchema>;
export type PlanNode = z.infer<typeof NodeSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Assertion = Extract<PlanNode, { kind: 'task' }>['assertions'][number];
