import { PlanSchema, type Plan, type PlanNode } from '@/automation/compiler/schema';
import type { Insertion } from './authoring';

const references = (node: PlanNode) => [
  ...node.dependsOn,
  ...(node.kind === 'group'
    ? node.children
    : node.kind === 'branch'
      ? [node.then, ...(node.otherwise ? [node.otherwise] : [])]
      : []),
];
const owner = (plan: Plan, id: string) =>
  Object.values(plan.nodes).find(
    (node): node is Extract<PlanNode, { kind: 'group' }> =>
      node.kind === 'group' && node.children.includes(id),
  );

export function updateNodeContent(plan: Plan, id: string, content: string): Plan {
  const node = plan.nodes[id];
  const patch =
    node.kind === 'branch'
      ? { condition: content }
      : {
          goal: content,
          ...(node.kind === 'task' && node.actionType === 'assert'
            ? { assertions: [{ description: content }] }
            : {}),
        };

  return PlanSchema.parse({ ...plan, nodes: { ...plan.nodes, [id]: { ...node, ...patch } } });
}

export function moveNode(plan: Plan, id: string, position: Insertion): Plan {
  if (id === plan.rootId) return plan;
  const parent = owner(plan, id);
  const target = plan.nodes[position.groupId];

  if (!parent || target.kind !== 'group') return plan;
  const nodes = structuredClone(plan.nodes);
  const oldIndex = parent.children.indexOf(id);

  (nodes[parent.id] as typeof parent).children.splice(oldIndex, 1);
  (nodes[target.id] as typeof target).children.splice(
    position.index - (parent.id === target.id && oldIndex < position.index ? 1 : 0),
    0,
    id,
  );

  return PlanSchema.parse({ ...plan, nodes });
}

export function duplicateNode(plan: Plan, id: string): Plan {
  const parent = owner(plan, id);

  if (!parent) return plan;
  const nodes = structuredClone(plan.nodes);
  const copies = new Map<string, string>();

  function collect(source: string) {
    if (copies.has(source)) return;
    copies.set(source, crypto.randomUUID());
    const node = plan.nodes[source];

    if (node.kind === 'group') node.children.forEach(collect);
    if (node.kind === 'branch') {
      collect(node.then);
      if (node.otherwise) collect(node.otherwise);
    }
  }

  collect(id);
  const map = (ref: string) => copies.get(ref) ?? ref;

  for (const [source, copy] of copies) {
    const node = structuredClone(plan.nodes[source]);

    nodes[copy] = {
      ...node,
      id: copy,
      dependsOn: node.dependsOn.map(map),
      ...(node.kind === 'group' ? { children: node.children.map(map) } : {}),
      ...(node.kind === 'branch'
        ? { then: map(node.then), ...(node.otherwise ? { otherwise: map(node.otherwise) } : {}) }
        : {}),
    };
  }

  (nodes[parent.id] as typeof parent).children.splice(parent.children.indexOf(id) + 1, 0, map(id));

  return PlanSchema.parse({ ...plan, nodes });
}

export function removeNode(plan: Plan, id: string): Plan {
  if (id === plan.rootId) return plan;
  const nodes = structuredClone(plan.nodes);
  const candidates = new Set<string>();

  function collect(ref: string) {
    if (candidates.has(ref)) return;
    candidates.add(ref);
    const node = nodes[ref];

    if (node.kind === 'group') node.children.forEach(collect);
    if (node.kind === 'branch') {
      collect(node.then);
      if (node.otherwise) collect(node.otherwise);
    }
  }

  collect(id);
  for (const node of Object.values(nodes)) {
    node.dependsOn = node.dependsOn.filter((ref) => ref !== id);
    if (node.kind === 'group') node.children = node.children.filter((ref) => ref !== id);
    // Keep branch paths valid when their visible empty group is removed.
    if (node.kind === 'branch' && (node.then === id || node.otherwise === id)) {
      nodes[id] = {
        id,
        kind: 'group',
        presentation: 'sequence',
        goal: '空分支',
        children: [],
        dependsOn: [],
      };
      candidates.delete(id);
    }
  }

  const retained = new Set<string>();

  function retain(ref: string) {
    if (retained.has(ref) || !nodes[ref]) return;
    retained.add(ref);
    references(nodes[ref]).forEach(retain);
  }

  Object.keys(nodes)
    .filter((ref) => !candidates.has(ref))
    .forEach(retain);
  for (const ref of candidates) if (!retained.has(ref)) delete nodes[ref];

  return PlanSchema.parse({ ...plan, nodes });
}

export function positionBefore(plan: Plan, id: string): Insertion | undefined {
  const parent = owner(plan, id);

  return parent && { groupId: parent.id, index: parent.children.indexOf(id) };
}
