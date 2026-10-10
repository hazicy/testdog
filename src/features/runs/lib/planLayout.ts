import type { Plan, PlanNode } from '@/automation/compiler/schema';
import type { Insertion } from '@/features/test-cases/lib/authoring';

export type LayoutNode = {
  id: string;
  planNodeId: string;
  parentId?: string;
  reference: boolean;
  assertionIndex?: number;
  pathLabel?: string;
  position: { x: number; y: number };
  width: number;
  height: number;
};
export type LayoutEdge = {
  id: string;
  source: string;
  target: string;
  kind: 'dependency' | 'branch' | 'reference' | 'sequence';
  label?: string;
};
export type LayoutInsertion = Insertion & { id: string; position: { x: number; y: number } };
export type PlanLayout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  insertions: LayoutInsertion[];
};
const WIDTH = 880,
  GAP = 56;
const text = (node: PlanNode) => (node.kind === 'branch' ? node.condition : node.goal);
const height = (value: string) => Math.max(72, 40 + Math.ceil(value.length / 58) * 28);

// Rows share one visual language in creation and execution. Groups are headers,
// not giant containers; branch paths remain side by side and merge before the
// next sibling. Hidden sequence boundaries preserve authored dependency semantics.
export async function layoutPlan(plan: Plan): Promise<PlanLayout> {
  const nodes: LayoutNode[] = [],
    edges: LayoutEdge[] = [],
    insertions: LayoutInsertion[] = [];
  const seen = new Set<string>();
  const actual = new Map<string, { first?: string; last?: string }>();
  let reference = 0;

  type Subtree = { first?: string; last?: string; bottom: number; right: number };

  function slot(groupId: string, index: number, x: number, y: number) {
    insertions.push({
      id: `insert:${groupId}:${index}`,
      groupId,
      index,
      position: { x: x + WIDTH / 2 - 18, y: y - 18 },
    });
  }

  function visit(id: string, x: number, y: number, pathLabel?: string): Subtree {
    const node = plan.nodes[id];

    if (seen.has(id)) {
      const refId = `reference:${reference++}`;

      nodes.push({
        id: refId,
        planNodeId: id,
        reference: true,
        pathLabel,
        position: { x, y },
        width: WIDTH,
        height: 72,
      });
      edges.push({
        id: `ref:${refId}`,
        source: refId,
        target: actual.get(id)?.first ?? `plan:${id}`,
        kind: 'reference',
        label: '引用',
      });

      return { first: refId, last: refId, bottom: y + 72, right: x + WIDTH };
    }

    seen.add(id);
    const hidden =
      node.kind === 'group' && node.presentation === 'sequence' && node.children.length > 0;
    const rowId = `plan:${id}`;
    const rowHeight = height(text(node));
    let first: string | undefined = hidden ? undefined : rowId;
    let last = first;
    let bottom = hidden ? y : y + rowHeight;
    let right = x + WIDTH;

    actual.set(id, { first, last });
    if (!hidden)
      nodes.push({
        id: rowId,
        planNodeId: id,
        reference: false,
        pathLabel,
        position: { x, y },
        width: WIDTH,
        height: rowHeight,
      });
    if (node.kind === 'group') {
      slot(id, 0, x, hidden ? y - GAP / 2 : bottom + GAP / 2);
      for (const [index, child] of node.children.entries()) {
        const subtree = visit(child, x, hidden && index === 0 ? y : bottom + GAP);

        if (last && subtree.first)
          edges.push({
            id: `sequence:${id}:${index}`,
            source: last,
            target: subtree.first,
            kind: 'sequence',
          });
        first ??= subtree.first;
        last = subtree.last ?? last;
        bottom = subtree.bottom;
        right = Math.max(right, subtree.right);
        slot(id, index + 1, x, bottom + GAP / 2);
      }

      if (!node.children.length) bottom += GAP;
    } else if (node.kind === 'branch') {
      const yes = visit(node.then, x, bottom + GAP, 'YES / 条件成立');

      if (yes.first)
        edges.push({
          id: `then:${id}`,
          source: rowId,
          target: yes.first,
          kind: 'branch',
          label: 'YES',
        });
      let no: Subtree | undefined;

      if (node.otherwise) {
        no = visit(node.otherwise, yes.right + 64, y + rowHeight + GAP, 'NO / 条件不成立');
        if (no.first)
          edges.push({
            id: `otherwise:${id}`,
            source: rowId,
            target: no.first,
            kind: 'branch',
            label: 'NO',
          });
      }

      bottom = Math.max(yes.bottom, no?.bottom ?? 0);
      right = Math.max(yes.right, no?.right ?? 0);
      last = yes.last ?? rowId;
    } else if (node.actionType !== 'assert') {
      for (const [index, assertion] of node.assertions.entries()) {
        const assertionId = `assertion:${id}:${index}`;
        const rowHeight = height(assertion.description);

        nodes.push({
          id: assertionId,
          planNodeId: id,
          assertionIndex: index,
          reference: false,
          position: { x, y: bottom + GAP },
          width: WIDTH,
          height: rowHeight,
        });
        edges.push({
          id: `assert:${id}:${index}`,
          source: last!,
          target: assertionId,
          kind: 'sequence',
        });
        bottom += GAP + rowHeight;
        last = assertionId;
      }
    }

    const result = { first, last, bottom, right };

    actual.set(id, result);

    return result;
  }

  let top = 0;

  function prerequisite(id: string) {
    if (seen.has(id)) return;
    plan.nodes[id].dependsOn.forEach(prerequisite);
    top = visit(id, 0, top).bottom + GAP;
  }

  plan.nodes[plan.rootId].dependsOn.forEach(prerequisite);
  let bottom = visit(plan.rootId, 0, top).bottom;

  for (const id of Object.keys(plan.nodes))
    if (!seen.has(id)) bottom = visit(id, 0, bottom + GAP).bottom;
  for (const node of Object.values(plan.nodes)) {
    for (const dependency of node.dependsOn) {
      const source = actual.get(dependency)?.last,
        target = actual.get(node.id)?.first;

      if (source && target)
        edges.push({
          id: `dep:${JSON.stringify([dependency, node.id])}`,
          source,
          target,
          kind: 'dependency',
        });
    }
  }

  return { nodes, edges, insertions };
}
