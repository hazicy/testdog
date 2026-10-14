import type { Plan, PlanNode } from '@testdog/contracts/automation/compiler/schema';
import type { ExecutionStep } from '@testdog/contracts/runs/types';
import { boardNodeSteps, indexStepsByNode, planNodeTitle } from './boardResults';

export type ExecutionGroup = {
  id: string;
  kind: PlanNode['kind'] | 'assertion';
  title: string;
  pathLabel?: string;
  reference?: string;
  actions: ExecutionStep[];
  steps: ExecutionStep[];
  children: ExecutionGroup[];
};

export function executionGroups(plan: Plan | undefined, steps: ExecutionStep[]) {
  if (!plan) return { groups: [], ungrouped: steps };
  const { nodes, rootId } = plan;
  const byNode = indexStepsByNode(steps);
  const assigned = new Set<string>();
  // A visited node points to its visible row; an empty target has no visible content.
  const targets = new Map<string, string>();
  let reference = 0;

  function visit(id: string, pathLabel?: string): ExecutionGroup[] {
    const node = nodes[id];
    const entry: ExecutionGroup = {
      id: `plan:${id}`,
      kind: node.kind,
      title: planNodeTitle(node),
      pathLabel,
      actions: [],
      steps: [],
      children: [],
    };
    const target = targets.get(id);

    if (target !== undefined)
      return target ? [{ ...entry, id: `reference:${reference++}`, reference: target }] : [];

    if (node.kind === 'group') entry.children = node.children.flatMap((child) => visit(child));
    if (node.kind === 'branch') {
      entry.children = visit(node.then, 'YES / 条件成立');
      if (node.otherwise) entry.children.push(...visit(node.otherwise, 'NO / 条件不成立'));
    }

    if (
      node.kind === 'group' &&
      (id === rootId || (node.presentation === 'sequence' && entry.children.length))
    ) {
      const first = entry.children[0];

      if (first && pathLabel) first.pathLabel = pathLabel;
      targets.set(id, first?.reference ?? first?.id ?? '');

      return entry.children;
    }

    const associated = byNode.get(id) ?? [];

    entry.actions = boardNodeSteps(node, associated);
    if (node.kind === 'task' && node.actionType !== 'assert') {
      entry.children = node.assertions.map((_, index) => {
        const actions = boardNodeSteps(node, associated, index);

        return {
          id: `assertion:${id}:${index}`,
          kind: 'assertion',
          title: planNodeTitle(node, index),
          actions,
          steps: actions,
          children: [],
        };
      });
    }

    entry.steps = [...entry.actions, ...entry.children.flatMap((child) => child.steps)];
    entry.steps.forEach((step) => assigned.add(step.id));
    targets.set(id, entry.id);

    return [entry];
  }

  const groups = visit(rootId);

  for (const id of Object.keys(nodes)) if (!targets.has(id)) groups.push(...visit(id));

  return { groups, ungrouped: steps.filter((step) => !assigned.has(step.id)) };
}
