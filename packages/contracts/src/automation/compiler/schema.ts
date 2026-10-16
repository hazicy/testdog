import { z } from 'zod';
import { PluginInvocationSchema, validatePlugin } from '@testdog/contracts/plugins/execution';
import { HttpUrlSchema } from '@testdog/contracts/automation/platform/target';

const LocatorSchema = z.object({
  kind: z.enum(['role', 'label', 'placeholder', 'testId', 'css', 'text', 'ariaRef']),
  value: z.string(),
  name: z.string().default(''),
  index: z.number().int().nonnegative().optional(),
});

export const TargetSchema = LocatorSchema.extend({
  scope: LocatorSchema.omit({ index: true }).optional(),
}).superRefine((target, context) => {
  if (target.scope && target.index !== undefined)
    context.addIssue({
      code: 'custom',
      message: '区域内定位必须唯一，不能使用 index',
    });
});

const ActionStepSchema = z.object({
  type: z.enum(['navigate', 'click', 'fill', 'press', 'screenshot']),
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

const StepTypeSchema = z.enum([
  'navigate',
  'act',
  'assert',
  'login',
  'files',
  'screenshot',
  'plugin',
]);

export type StepType = z.infer<typeof StepTypeSchema>;

export const NodeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('group'),
      id,
      goal: id,
      children: ids,
      dependsOn: ids,
      presentation: z.literal('sequence').optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('task'),
      actionType: StepTypeSchema.optional(),
      plugin: PluginInvocationSchema.optional(),
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

export function nodeChildren(node: PlanNode): string[] {
  if (node.kind === 'group') return node.children;
  if (node.kind === 'branch') return [node.then, ...(node.otherwise ? [node.otherwise] : [])];

  return [];
}

// Drafts may contain empty groups. Persisted and compiled cases must do work,
// and an assertion task must never silently pass without checking anything.
export const ExecutablePlanSchema = PlanSchema.superRefine((plan, ctx) => {
  const reachable = new Set<string>();
  const visit = (id: string) => {
    if (reachable.has(id) || !Object.hasOwn(plan.nodes, id)) return;
    reachable.add(id);
    nodeReferences(plan.nodes[id]).forEach(visit);
  };

  visit(plan.rootId);
  if (![...reachable].some((id) => plan.nodes[id].kind === 'task'))
    ctx.addIssue({ code: 'custom', message: '请添加至少一个可执行步骤' });
  for (const id of Object.keys(plan.nodes))
    if (!reachable.has(id))
      ctx.addIssue({ code: 'custom', message: `步骤未连接到测试入口：${id}` });
  for (const id of reachable) {
    const node = plan.nodes[id];

    if (
      node.kind === 'task' &&
      node.actionType === 'navigate' &&
      !HttpUrlSchema.safeParse(node.goal).success
    )
      ctx.addIssue({
        code: 'custom',
        message: '请在 Navigate 步骤中填写有效的 http 或 https 地址',
        path: ['nodes', id, 'goal'],
      });
    if (node.kind === 'task' && node.actionType === 'plugin') {
      try {
        if (!node.plugin) throw new Error('请配置插件');
        validatePlugin(node.plugin);
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          message: `插件配置无效：${id} · ${error instanceof Error ? error.message : String(error)}`,
          path: ['nodes', id, 'plugin'],
        });
      }
    }

    if (node.kind === 'task' && node.plugin && node.actionType !== 'plugin')
      ctx.addIssue({ code: 'custom', message: `非插件步骤不能包含插件配置：${id}` });
    if (node.kind === 'task' && node.actionType === 'assert' && !node.assertions.length)
      ctx.addIssue({ code: 'custom', message: `验证步骤缺少预期结果：${id}` });
  }

  // Dependencies must not pull work out of an unselected conditional path.
  // Shared descendants remain valid; only exclusive path membership is gated.
  const descendants = (root?: string) => {
    const result = new Set<string>();
    const visit = (id: string) => {
      if (result.has(id) || !Object.hasOwn(plan.nodes, id)) return;
      result.add(id);
      nodeChildren(plan.nodes[id]).forEach(visit);
    };

    if (root) visit(root);

    return result;
  };

  for (const id of reachable) {
    const branch = plan.nodes[id];

    if (branch.kind !== 'branch') continue;
    const then = descendants(branch.then);
    const otherwise = descendants(branch.otherwise);

    for (const nodeId of reachable) {
      const node = plan.nodes[nodeId];

      for (const dependency of nodeReferences(node)) {
        const path =
          then.has(dependency) && !otherwise.has(dependency)
            ? then
            : otherwise.has(dependency) && !then.has(dependency)
              ? otherwise
              : undefined;

        if (
          path &&
          !path.has(nodeId) &&
          !(nodeId === id && nodeChildren(node).includes(dependency))
        )
          ctx.addIssue({
            code: 'custom',
            message: `节点 ${nodeId} 不能直接引用条件分支 ${id} 中的互斥步骤 ${dependency}，请依赖分支节点`,
          });
      }
    }
  }
});

export function nodeReferences(node: PlanNode): string[] {
  return [...node.dependsOn, ...nodeChildren(node)];
}

export function mapNodeReferences(node: PlanNode, map: (id: string) => string): PlanNode {
  const mapped = { ...node, id: map(node.id), dependsOn: node.dependsOn.map(map) };

  if (mapped.kind === 'group') return { ...mapped, children: mapped.children.map(map) };
  if (mapped.kind === 'branch')
    return {
      ...mapped,
      then: map(mapped.then),
      ...(mapped.otherwise ? { otherwise: map(mapped.otherwise) } : {}),
    };

  return mapped;
}

export type Target = z.infer<typeof TargetSchema>;
export type Step = z.infer<typeof StepSchema>;
export type PlanNode = z.infer<typeof NodeSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Assertion = Extract<PlanNode, { kind: 'task' }>['assertions'][number];
