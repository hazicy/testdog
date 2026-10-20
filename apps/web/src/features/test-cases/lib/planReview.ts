import {
  PlanSchema,
  nodeChildren,
  nodeReferences,
  mapNodeReferences,
  type Plan,
  type PlanNode,
} from '@testdog/contracts/execution/plan';

type PlanChange = {
  id: string;
  nodeIds: string[];
  kind: 'added' | 'modified' | 'removed';
  before?: PlanNode;
  after?: PlanNode;
};
export type PlanReview = { before: Plan; after: Plan; changes: PlanChange[] };
export type ReviewDecisions = Record<string, boolean>;

const content = (node: PlanNode) => {
  if (node.kind === 'group')
    return { kind: node.kind, goal: node.goal, presentation: node.presentation };
  if (node.kind === 'branch') return { kind: node.kind, condition: node.condition };

  return {
    kind: node.kind,
    actionType: node.actionType ?? 'act',
    goal: node.goal,
    assertions: node.assertions,
    requirementIds: node.requirementIds,
  };
};

const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, stable(item)]),
        )
      : value;
const same = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const scaffold = (node?: PlanNode) => node?.kind === 'group' && node.presentation === 'sequence';
const owners = (plan: Plan) => {
  const result = new Map<string, string>();

  for (const node of Object.values(plan.nodes))
    for (const child of nodeChildren(node)) result.set(child, node.id);

  return result;
};

function reorderedChildren(before: string[], after: string[]): string[] {
  const afterIds = new Set(after);
  const common = before.filter((id) => afterIds.has(id));
  const commonIds = new Set(common);
  const reordered = after.filter((id) => commonIds.has(id));

  return common.filter((id, index) => reordered[index] !== id);
}

// Generated IDs may change. Match stable IDs first, then unique equal content,
// then an isolated replacement between the same sequence anchors.
function align(before: Plan, source: Plan): Plan {
  const map = new Map<string, string>([[source.rootId, before.rootId]]);
  const used = new Set([before.rootId]);

  for (const node of Object.values(source.nodes)) {
    if (!map.has(node.id) && before.nodes[node.id] && !used.has(node.id)) {
      map.set(node.id, node.id);
      used.add(node.id);
    }
  }

  for (const node of Object.values(source.nodes)) {
    if (map.has(node.id)) continue;
    const matches = Object.values(before.nodes).filter(
      (old) => !used.has(old.id) && same(content(old), content(node)),
    );
    const duplicates = Object.values(source.nodes).filter(
      (other) => !map.has(other.id) && same(content(other), content(node)),
    );

    if (matches.length === 1 && duplicates.length === 1) {
      map.set(node.id, matches[0].id);
      used.add(matches[0].id);
    }
  }

  for (const group of Object.values(source.nodes)) {
    const old = before.nodes[map.get(group.id) ?? ''];

    if (group.kind !== 'group' || old?.kind !== 'group') continue;
    const fresh = group.children.filter((id) => !map.has(id));
    const missing = old.children.filter((id) => !used.has(id));

    if (
      fresh.length === 1 &&
      missing.length === 1 &&
      source.nodes[fresh[0]].kind === before.nodes[missing[0]].kind
    ) {
      map.set(fresh[0], missing[0]);
      used.add(missing[0]);
    }
  }

  for (const id of Object.keys(source.nodes)) {
    if (map.has(id)) continue;
    let next = id;

    while (used.has(next) || Object.hasOwn(before.nodes, next)) next += '-new';
    map.set(id, next);
    used.add(next);
  }

  const id = (value: string) => map.get(value) ?? value;
  const nodes: Plan['nodes'] = {};

  for (const node of Object.values(source.nodes)) nodes[id(node.id)] = mapNodeReferences(node, id);

  return PlanSchema.parse({ rootId: before.rootId, nodes });
}

function changedNodes(before: Plan, after: Plan): Set<string> {
  const oldOwners = owners(before);
  const newOwners = owners(after);
  const changed = new Set<string>();
  const reordered = new Set<string>();

  for (const old of Object.values(before.nodes)) {
    const next = after.nodes[old.id];

    if (old.kind !== 'group' || next?.kind !== 'group') continue;
    for (const id of reorderedChildren(old.children, next.children)) reordered.add(id);
  }

  for (const id of new Set([...Object.keys(before.nodes), ...Object.keys(after.nodes)])) {
    const old = before.nodes[id];
    const next = after.nodes[id];

    if ((!old || scaffold(old)) && (!next || scaffold(next))) continue;
    const oldOwner = oldOwners.get(id);
    const newOwner = newOwners.get(id);

    if (nodeChanged(old, next) || oldOwner !== newOwner || reordered.has(id)) changed.add(id);
  }

  return changed;
}

function nodeChanged(old: PlanNode | undefined, next: PlanNode | undefined): boolean {
  if (!old || !next) return true;
  if (!same(content(old), content(next)) || !same(old.dependsOn, next.dependsOn)) return true;

  return (
    old.kind === 'branch' &&
    next.kind === 'branch' &&
    (old.then !== next.then || old.otherwise !== next.otherwise)
  );
}

function groupChanges(before: Plan, after: Plan, changed: Set<string>): Set<string>[] {
  const oldOwners = owners(before);
  const newOwners = owners(after);
  const groups = new Map([...changed].map((id) => [id, new Set([id])]));
  const join = (a: string, b: string) => {
    const left = groups.get(a);
    const right = groups.get(b);

    if (!left || !right || left === right) return;
    for (const id of right) {
      left.add(id);
      groups.set(id, left);
    }
  };

  for (const id of changed) {
    const old = before.nodes[id];
    const next = after.nodes[id];

    for (const node of [old, next]) {
      if (!node) continue;
      for (const ref of nodeReferences(node)) {
        const structural =
          node.kind === 'branch' || (node.kind === 'group' && !scaffold(node) && (!old || !next));

        if (structural || !before.nodes[ref] || !after.nodes[ref]) join(id, ref);
      }
    }

    const parent = newOwners.get(id) ?? oldOwners.get(id);

    if (
      parent &&
      !scaffold(before.nodes[parent] ?? after.nodes[parent]) &&
      (!before.nodes[parent] || !after.nodes[parent])
    )
      join(id, parent);
  }

  for (const old of Object.values(before.nodes)) {
    const next = after.nodes[old.id];

    if (old.kind !== 'group' || next?.kind !== 'group') continue;
    const moved = reorderedChildren(old.children, next.children);

    for (const id of moved) join(moved[0], id);
  }

  return [...new Set(groups.values())];
}

export function reviewPlan(before: Plan, source: Plan): PlanReview {
  const after = align(before, source);
  const changes = groupChanges(before, after, changedNodes(before, after)).map(
    (ids): PlanChange => {
      const nodeIds = [...ids];
      const id =
        nodeIds.find(
          (value) =>
            before.nodes[value]?.kind === 'branch' || after.nodes[value]?.kind === 'branch',
        ) ??
        nodeIds.find(
          (value) => before.nodes[value]?.kind === 'group' || after.nodes[value]?.kind === 'group',
        ) ??
        nodeIds[0];

      return {
        id,
        nodeIds,
        kind: !before.nodes[id] ? 'added' : !after.nodes[id] ? 'removed' : 'modified',
        before: before.nodes[id],
        after: after.nodes[id],
      };
    },
  );

  return { before, after, changes };
}

function resolveChildren(
  parentId: string,
  review: PlanReview,
  choice: Map<string, boolean>,
  nodes: Plan['nodes'],
  selectedOwner: Map<string, string>,
): string[] {
  const old = review.before.nodes[parentId];
  const next = review.after.nodes[parentId];
  const oldOrder = old?.kind === 'group' ? old.children : [];
  let newOrder = next?.kind === 'group' ? next.children : [];
  const moved = reorderedChildren(oldOrder, newOrder);

  if (moved.length && moved.every((id) => !choice.get(id)))
    newOrder = [...oldOrder, ...newOrder.filter((id) => !oldOrder.includes(id))];
  const belongs = (id: string) => !!nodes[id] && selectedOwner.get(id) === parentId;
  const order = newOrder.filter(belongs);

  for (let index = 0; index < oldOrder.length; index++) {
    const id = oldOrder[index];

    if (!belongs(id) || order.includes(id)) continue;
    const anchor = oldOrder.slice(index + 1).find((value) => order.includes(value));
    const previous = oldOrder
      .slice(0, index)
      .reverse()
      .find((value) => order.includes(value));

    order.splice(
      anchor ? order.indexOf(anchor) : previous ? order.indexOf(previous) + 1 : 0,
      0,
      id,
    );
  }

  return order;
}

export function resolveReview(
  review: PlanReview,
  decisions: ReviewDecisions,
  preview = false,
): Plan {
  const choice = new Map<string, boolean>();

  for (const change of review.changes)
    for (const id of change.nodeIds) choice.set(id, decisions[change.id] ?? preview);
  const nodes: Plan['nodes'] = {};
  const oldOwners = owners(review.before);
  const newOwners = owners(review.after);
  const selectedOwner = new Map<string, string>();

  for (const id of new Set([
    ...Object.keys(review.before.nodes),
    ...Object.keys(review.after.nodes),
  ])) {
    const next = choice.get(id) ?? (!review.before.nodes[id] && scaffold(review.after.nodes[id]));
    const node = (next ? review.after : review.before).nodes[id];

    if (!node) continue;
    nodes[id] = structuredClone(node);
    const parent = (next ? newOwners : oldOwners).get(id);

    if (parent) selectedOwner.set(id, parent);
  }

  for (const node of Object.values(nodes)) {
    if (node.kind !== 'group') continue;
    node.children = resolveChildren(node.id, review, choice, nodes, selectedOwner);
  }

  for (const [id, node] of Object.entries(nodes)) {
    if (
      scaffold(node) &&
      node.kind === 'group' &&
      !node.children.length &&
      (!review.before.nodes[id] || !review.after.nodes[id])
    )
      delete nodes[id];
  }

  for (const node of Object.values(nodes))
    if (node.kind === 'group') node.children = node.children.filter((id) => !!nodes[id]);

  return PlanSchema.parse({ rootId: review.before.rootId, nodes });
}
