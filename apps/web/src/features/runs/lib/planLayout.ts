import { graphlib, layout } from '@dagrejs/dagre';
import type { Plan, PlanNode } from '@testdog/contracts/automation/compiler/schema';
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
export type LayoutInsertion = Insertion & {
  id: string;
  anchorId?: string;
  position: { x: number; y: number };
};
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
const height = (value: string) =>
  Math.max(
    72,
    40 +
      value.split('\n').reduce((lines, line) => {
        const width = Array.from(line).reduce(
          (width, character) => width + (character.charCodeAt(0) > 255 ? 20 : 11),
          0,
        );

        return lines + Math.max(1, Math.ceil(width / (WIDTH - 300)));
      }, 0) *
        28,
  );

// Build the visible execution graph first, then let Dagre position its nodes.
// Hidden sequences delegate to their children; repeated targets use reference nodes.
export function layoutPlan(plan: Plan, results = false): PlanLayout {
  const nodes: LayoutNode[] = [],
    edges: LayoutEdge[] = [];
  const slots: { groupId: string; index: number; anchors: string[] }[] = [];
  const ordering: { source: string; target: string }[] = [];

  type Subtree = { first: string; exits: string[] };
  const subtrees = new Map<string, Subtree>();
  let reference = 0;

  function connect(
    sources: string[],
    target: string | undefined,
    kind: LayoutEdge['kind'],
    id: string,
  ) {
    if (!target) return;
    for (const source of sources) edges.push({ id: `${id}:${source}`, source, target, kind });
  }

  const isVisibleGroup = (id: string) => {
    const node = plan.nodes[id];

    return node.kind === 'group' && !node.presentation;
  };

  function visit(id: string, pathLabel?: string): Subtree {
    const node = plan.nodes[id];
    const contentHeight =
      height(text(node)) +
      (pathLabel ? 16 : 0) +
      (node.kind === 'branch' && !node.otherwise ? 16 : 0);

    const previous = subtrees.get(id);
    const rowId = previous ? `reference:${reference++}` : `plan:${id}`;
    const hidden =
      !previous &&
      node.kind === 'group' &&
      node.presentation === 'sequence' &&
      node.children.length > 0;

    if (!hidden)
      nodes.push({
        id: rowId,
        planNodeId: id,
        reference: !!previous,
        pathLabel,
        position: { x: 0, y: 0 },
        width: WIDTH,
        height: contentHeight + (results && !previous && node.kind !== 'group' ? 190 : 0),
      });
    if (previous) {
      edges.push({
        id: `ref:${rowId}`,
        source: rowId,
        target: previous.first,
        kind: 'reference',
        label: 'reference',
      });

      return { first: rowId, exits: [rowId] };
    }

    let first = rowId;
    let exits = hidden ? [] : [rowId];

    if (node.kind === 'group') {
      if (!hidden) slots.push({ groupId: id, index: 0, anchors: [rowId] });
      let columnEntry: string[] | undefined;

      for (const [index, childId] of node.children.entries()) {
        const child = visit(childId, hidden && index === 0 ? pathLabel : undefined);

        if (hidden && index === 0) first = child.first;
        if (isVisibleGroup(childId)) {
          if (!columnEntry) {
            columnEntry = exits;
            exits = [];
          }

          for (const source of columnEntry) ordering.push({ source, target: child.first });
          connect(
            hidden ? columnEntry : [rowId],
            child.first,
            'containment',
            `containment:${id}:${index}`,
          );
          exits.push(...child.exits);
        } else {
          columnEntry = undefined;
          connect(exits, child.first, 'sequence', `sequence:${id}:${index}`);
          exits = child.exits;
        }

        if (plan.nodes[childId].kind !== 'group')
          slots.push({ groupId: id, index: index + 1, anchors: child.exits });
      }
    } else if (node.kind === 'branch') {
      const yes = visit(node.then, 'yesCondition');

      edges.push({
        id: `then:${id}`,
        source: rowId,
        target: yes.first,
        kind: 'branch',
        label: 'YES',
      });
      const no = node.otherwise ? visit(node.otherwise, 'noCondition') : undefined;

      if (no)
        edges.push({
          id: `otherwise:${id}`,
          source: rowId,
          target: no.first,
          kind: 'branch',
          label: 'NO',
        });
      exits = [...yes.exits, ...(no?.exits ?? [rowId])];
    } else if (node.actionType !== 'assert') {
      for (const [index, assertion] of node.assertions.entries()) {
        const assertionId = `assertion:${id}:${index}`;

        nodes.push({
          id: assertionId,
          planNodeId: id,
          assertionIndex: index,
          reference: false,
          position: { x: 0, y: 0 },
          width: WIDTH,
          height: height(assertion.description) + (results ? 190 : 0),
        });
        edges.push({
          id: `assert:${id}:${index}`,
          source: exits[0],
          target: assertionId,
          kind: 'sequence',
        });
        exits = [assertionId];
      }
    }

    const result = { first, exits };

    subtrees.set(id, result);

    return result;
  }

  function prerequisite(id: string) {
    if (subtrees.has(id)) return;
    plan.nodes[id].dependsOn.forEach(prerequisite);
    visit(id);
  }

  plan.nodes[plan.rootId].dependsOn.forEach(prerequisite);
  visit(plan.rootId);
  for (const id of Object.keys(plan.nodes)) if (!subtrees.has(id)) visit(id);
  for (const node of Object.values(plan.nodes))
    for (const dependency of node.dependsOn)
      connect(
        subtrees.get(dependency)?.exits ?? [],
        subtrees.get(node.id)?.first,
        'dependency',
        `dep:${JSON.stringify([dependency, node.id])}`,
      );

  const graph = new graphlib.Graph();

  graph.setGraph({ rankdir: 'TB', nodesep: COLUMN_GAP, ranksep: GAP });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) graph.setNode(node.id, { width: node.width, height: node.height });
  // References point back to existing nodes and must not reverse execution ranks.
  for (const edge of edges) if (edge.kind !== 'reference') graph.setEdge(edge.source, edge.target);
  for (const edge of ordering) graph.setEdge(edge.source, edge.target);
  layout(graph);

  const byId = new Map(nodes.map((node) => [node.id, node]));

  for (const node of nodes) {
    const position = graph.node(node.id);

    node.position = { x: position.x - node.width / 2, y: position.y - node.height / 2 };
  }

  const insertions = slots.map(({ groupId, index, anchors }): LayoutInsertion => {
    const anchor = byId.get(anchors[0])!;
    const bottom = Math.max(
      ...anchors.map((id) => {
        const node = byId.get(id)!;

        return node.position.y + node.height;
      }),
    );

    return {
      id: `insert:${groupId}:${index}`,
      groupId,
      index,
      anchorId: anchor.id,
      position: {
        x: anchor.position.x + anchor.width / 2 - 18,
        y: bottom + GAP / 2 - 18,
      },
    };
  });

  return { nodes, edges, insertions };
}
