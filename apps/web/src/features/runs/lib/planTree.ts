import type { Plan } from '@testdog/contracts/automation/compiler/schema';

type PlanTree = {
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

    const tree: PlanTree = { id, children: [] };

    if (node.kind === 'group') tree.children = node.children.map(visit);
    if (node.kind === 'branch') {
      tree.then = visit(node.then);
      if (node.otherwise) tree.otherwise = visit(node.otherwise);
    }

    return tree;
  };

  const result = [visit(plan.rootId)];

  for (const id of Object.keys(plan.nodes)) if (!seen.has(id)) result.push(visit(id));

  return result;
}
