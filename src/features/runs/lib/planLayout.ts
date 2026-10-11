import type { Plan, PlanNode } from '@/automation/compiler/schema';
import type { Insertion } from '@/features/test-cases/lib/authoring';

export type LayoutNode = {
  id: string;
  planNodeId: string;
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
  kind: 'dependency' | 'branch' | 'reference' | 'sequence' | 'containment';
  label?: string;
};
export type LayoutInsertion = Insertion & { id: string; position: { x: number; y: number } };
export type PlanLayout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  insertions: LayoutInsertion[];
};
export const PLAN_ROW_WIDTH = 880;
const WIDTH = PLAN_ROW_WIDTH,
  GAP = 56,
  COLUMN_GAP = 64;
const text = (node: PlanNode) => (node.kind === 'branch' ? node.condition : node.goal);
const height = (value: string) => Math.max(72, 40 + Math.ceil(value.length / 58) * 28);

// Consecutive visible groups use columns; tasks and hidden sequences use rows.
// Visible group columns connect to their parent rather than to each other.
// Column placement does not change authored execution order. Branch exits both
// connect to the following step. Layout is a synchronous, UI-independent function.
export function layoutPlan(plan: Plan): PlanLayout {
  const nodes: LayoutNode[] = [],
    edges: LayoutEdge[] = [],
    insertions: LayoutInsertion[] = [];
  const seen = new Set<string>();
  const actual = new Map<string, { first?: string; exits: string[] }>();
  let reference = 0;

  type Subtree = { first?: string; exits: string[]; bottom: number; right: number };

  function connect(
    sources: string[],
    target: string | undefined,
    kind: LayoutEdge['kind'],
    id: string,
  ) {
    if (!target) return;
    for (const source of sources) edges.push({ id: `${id}:${source}`, source, target, kind });
  }

  const column = (id: string) => {
    const node = plan.nodes[id];

    return node.kind === 'group' && !node.presentation;
  };

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

      return { first: refId, exits: [refId], bottom: y + 72, right: x + WIDTH };
    }

    seen.add(id);
    const hidden =
      node.kind === 'group' && node.presentation === 'sequence' && node.children.length > 0;
    const rowId = `plan:${id}`;
    const rowHeight = height(text(node));
    let first: string | undefined = hidden ? undefined : rowId;
    let exits = first ? [first] : [];
    let bottom = hidden ? y : y + rowHeight;
    let right = x + WIDTH;

    actual.set(id, { first, exits });
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
      if (!hidden) slot(id, 0, x, bottom + GAP / 2);
      for (let index = 0; index < node.children.length;) {
        const rowTop = hidden && index === 0 ? y : bottom + GAP;
        let rowRight = x;
        let rowBottom = rowTop;
        const columns = column(node.children[index]);
        const rowEntry = exits;

        do {
          const subtree = visit(
            node.children[index],
            rowRight,
            rowTop,
            hidden && index === 0 ? pathLabel : undefined,
          );

          if (columns)
            connect(
              hidden ? rowEntry : [rowId],
              subtree.first,
              'containment',
              `containment:${id}:${index}`,
            );
          else connect(exits, subtree.first, 'sequence', `sequence:${id}:${index}`);
          first ??= subtree.first;
          exits = subtree.exits.length ? subtree.exits : exits;
          rowBottom = Math.max(rowBottom, subtree.bottom);
          right = Math.max(right, subtree.right);
          rowRight = subtree.right + COLUMN_GAP;
          index++;
          const nextColumn =
            columns && index < node.children.length && column(node.children[index]);

          if (!nextColumn) {
            // Visible groups own their header insertion. Hidden groups delegate
            // to their visible children. Neither needs a second parent slot.
            if (plan.nodes[node.children[index - 1]].kind !== 'group')
              slot(id, index, x, rowBottom + GAP / 2);
            break;
          }
        } while (index < node.children.length);

        bottom = rowBottom;
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
        no = visit(node.otherwise, yes.right + COLUMN_GAP, y + rowHeight + GAP, 'NO / 条件不成立');
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
      exits = [...yes.exits, ...(no?.exits ?? [rowId])];
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
          source: exits[0],
          target: assertionId,
          kind: 'sequence',
        });
        bottom += GAP + rowHeight;
        exits = [assertionId];
      }
    }

    const result = { first, exits, bottom, right };

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
      connect(
        actual.get(dependency)?.exits ?? [],
        actual.get(node.id)?.first,
        'dependency',
        `dep:${JSON.stringify([dependency, node.id])}`,
      );
    }
  }

  return { nodes, edges, insertions };
}
