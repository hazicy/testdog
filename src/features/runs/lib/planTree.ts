import type { Plan } from '@/automation/compiler/schema';

export type PlanTree = {
  id: string;
  reference?: boolean;
  children: PlanTree[];
  then?: PlanTree;
  otherwise?: PlanTree;
};

export function planForest(plan: Plan): PlanTree[] {
  const seen = new Set<string>();
  const visit = (id: string): PlanTree => {
    if (seen.has(id)) return { id, reference: true, children: [] };
    seen.add(id);
    const node = plan.nodes[id];

    return {
      id,
      children: node.kind === 'group' ? node.children.map(visit) : [],
      ...(node.kind === 'branch'
        ? {
            then: visit(node.then),
            ...(node.otherwise ? { otherwise: visit(node.otherwise) } : {}),
          }
        : {}),
    };
  };
  const result = [visit(plan.rootId)];
  for (const id of Object.keys(plan.nodes)) if (!seen.has(id)) result.push(visit(id));

  return result;
}
