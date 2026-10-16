import { validatePlugin, type PluginInvocation } from '@testdog/contracts/plugins/execution';
import {
  PlanSchema,
  nodeChildren,
  nodeReferences,
  mapNodeReferences,
  type Plan,
  type PlanNode,
} from '@testdog/contracts/automation/compiler/schema';
import { defaultAuthoringLabels, type Insertion } from '@/features/test-cases/lib/authoring';

function subtreeIds(plan: Plan, id: string): Set<string> {
  const ids = new Set<string>();
  const visit = (ref: string) => {
    if (ids.has(ref)) return;
    ids.add(ref);
    nodeChildren(plan.nodes[ref]).forEach(visit);
  };

  visit(id);

  return ids;
}

const owner = (plan: Plan, id: string) =>
  Object.values(plan.nodes).find(
    (node): node is Extract<PlanNode, { kind: 'group' }> =>
      node.kind === 'group' && node.children.includes(id),
  );

export function updateNodeContent(
  plan: Plan,
  id: string,
  content: string,
  assertionIndex?: number,
  labels = defaultAuthoringLabels,
): Plan {
  const node = plan.nodes[id];

  if (assertionIndex !== undefined) {
    if (node.kind !== 'task' || !node.assertions[assertionIndex])
      throw new Error(labels.invalidAssertion);
    const assertions = node.assertions.map((assertion, index) =>
      index === assertionIndex ? { ...assertion, description: content } : assertion,
    );

    return PlanSchema.parse({ ...plan, nodes: { ...plan.nodes, [id]: { ...node, assertions } } });
  }

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

  if (!parent || target?.kind !== 'group') return plan;
  const oldIndex = parent.children.indexOf(id);

  if (parent.id === target.id && (position.index === oldIndex || position.index === oldIndex + 1))
    return plan;
  const nodes = structuredClone(plan.nodes);

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
  const copies = new Map([...subtreeIds(plan, id)].map((ref) => [ref, crypto.randomUUID()]));
  const map = (ref: string) => copies.get(ref) ?? ref;

  for (const [source, copy] of copies) {
    const node = structuredClone(plan.nodes[source]);

    nodes[copy] = mapNodeReferences(node, map);
  }

  (nodes[parent.id] as typeof parent).children.splice(parent.children.indexOf(id) + 1, 0, map(id));

  return PlanSchema.parse({ ...plan, nodes });
}

export function removeNode(plan: Plan, id: string, labels = defaultAuthoringLabels): Plan {
  if (id === plan.rootId) return plan;
  const nodes = structuredClone(plan.nodes);
  const candidates = subtreeIds(plan, id);

  for (const node of Object.values(nodes)) {
    node.dependsOn = node.dependsOn.filter((ref) => ref !== id);
    if (node.kind === 'group') node.children = node.children.filter((ref) => ref !== id);
    // Keep branch paths valid when their visible empty group is removed.
    if (node.kind === 'branch' && (node.then === id || node.otherwise === id)) {
      nodes[id] = {
        id,
        kind: 'group',
        presentation: 'sequence',
        goal: labels.emptyBranch,
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
    nodeReferences(nodes[ref]).forEach(retain);
  }

  Object.keys(nodes)
    .filter((ref) => !candidates.has(ref))
    .forEach(retain);
  for (const ref of candidates) if (!retained.has(ref)) delete nodes[ref];

  return PlanSchema.parse({ ...plan, nodes });
}

export function updateNodePlugin(
  plan: Plan,
  id: string,
  plugin: PluginInvocation,
  title: string,
): Plan {
  const node = plan.nodes[id];

  if (node.kind !== 'task' || node.actionType !== 'plugin') throw new Error('Not a plugin node');
  validatePlugin(plugin);

  return PlanSchema.parse({
    ...plan,
    nodes: { ...plan.nodes, [id]: { ...node, plugin, goal: title } },
  });
}
