import { PlanSchema, type Plan, type PlanNode } from '@/automation/compiler/schema';

export type PlanChange = {
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
const refs = (node: PlanNode) => [
  ...node.dependsOn,
  ...(node.kind === 'group'
    ? node.children
    : node.kind === 'branch'
      ? [node.then, ...(node.otherwise ? [node.otherwise] : [])]
      : []),
];
const owners = (plan: Plan) => {
  const result = new Map<string, string>();

  for (const node of Object.values(plan.nodes)) {
    if (node.kind === 'group') for (const child of node.children) result.set(child, node.id);
    if (node.kind === 'branch') {
      result.set(node.then, node.id);
      if (node.otherwise) result.set(node.otherwise, node.id);
    }
  }

  return result;
};

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

  for (const node of Object.values(source.nodes))
    nodes[id(node.id)] = {
      ...node,
      id: id(node.id),
      dependsOn: node.dependsOn.map(id),
      ...(node.kind === 'group' ? { children: node.children.map(id) } : {}),
      ...(node.kind === 'branch'
        ? { then: id(node.then), ...(node.otherwise ? { otherwise: id(node.otherwise) } : {}) }
        : {}),
    };

  return PlanSchema.parse({ rootId: before.rootId, nodes });
}

export function reviewPlan(before: Plan, source: Plan): PlanReview {
  const after = align(before, source);
  const oldOwners = owners(before);
  const newOwners = owners(after);
  const changed = new Set<string>();

  for (const id of new Set([...Object.keys(before.nodes), ...Object.keys(after.nodes)])) {
    const old = before.nodes[id];
    const next = after.nodes[id];

    if ((!old || scaffold(old)) && (!next || scaffold(next))) continue;
    let moved = oldOwners.get(id) !== newOwners.get(id);
    const oldParent = before.nodes[oldOwners.get(id) ?? ''];
    const newParent = after.nodes[newOwners.get(id) ?? ''];

    if (oldParent?.kind === 'group' && newParent?.kind === 'group') {
      const common = oldParent.children.filter((child) => newParent.children.includes(child));

      moved ||=
        common.indexOf(id) !==
        newParent.children.filter((child) => common.includes(child)).indexOf(id);
    }

    if (
      !old ||
      !next ||
      !same(content(old), content(next)) ||
      !same(old.dependsOn, next.dependsOn) ||
      moved ||
      (old.kind === 'branch' &&
        next.kind === 'branch' &&
        (old.then !== next.then || old.otherwise !== next.otherwise))
    )
      changed.add(id);
  }

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
      for (const ref of refs(node)) {
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
    const common = old.children.filter((id) => next.children.includes(id));

    if (
      !same(
        common,
        next.children.filter((id) => common.includes(id)),
      )
    ) {
      const reordered = next.children.filter((id) => common.includes(id));
      const moved = common.filter((id, index) => reordered[index] !== id);

      for (const id of moved) join(moved[0], id);
    }
  }

  const changes = [...new Set(groups.values())].map((ids): PlanChange => {
    const nodeIds = [...ids];
    const id =
      nodeIds.find(
        (value) => before.nodes[value]?.kind === 'branch' || after.nodes[value]?.kind === 'branch',
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
  });

  return { before, after, changes };
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
    const old = review.before.nodes[node.id];
    const next = review.after.nodes[node.id];
    const oldOrder = old?.kind === 'group' ? old.children : [];
    let newOrder = next?.kind === 'group' ? next.children : [];
    const common = oldOrder.filter((id) => newOrder.includes(id));

    if (
      !same(
        common,
        newOrder.filter((id) => common.includes(id)),
      ) &&
      common
        .filter((id, index) => newOrder.filter((value) => common.includes(value))[index] !== id)
        .every((id) => !choice.get(id))
    )
      newOrder = [...oldOrder, ...newOrder.filter((id) => !oldOrder.includes(id))];
    const order = newOrder.filter((id) => nodes[id] && selectedOwner.get(id) === node.id);

    for (let index = 0; index < oldOrder.length; index++) {
      const id = oldOrder[index];

      if (!nodes[id] || selectedOwner.get(id) !== node.id || order.includes(id)) continue;
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

    for (const id of newOrder)
      if (nodes[id] && selectedOwner.get(id) === node.id && !order.includes(id)) order.push(id);
    node.children = order;
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
