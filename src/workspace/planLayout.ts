import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { Plan } from '@/automation/compiler/schema';
import { planForest, type PlanTree } from './planTree';

export type LayoutNode = {
  id: string;
  planNodeId: string;
  parentId?: string;
  reference: boolean;
  pathLabel?: string;
  position: { x: number; y: number };
  width: number;
  height: number;
};
export type LayoutEdge = {
  id: string;
  source: string;
  target: string;
  kind: 'dependency' | 'branch' | 'reference';
  label?: string;
};
export type PlanLayout = { nodes: LayoutNode[]; edges: LayoutEdge[] };

const CARD_WIDTH = 300;
const HEADER_HEIGHT = 200;

// Layout each container from the inside out. Cross-container dependencies are
// projected onto siblings for ordering, but retain their real endpoints in the UI.
export async function layoutPlan(plan: Plan): Promise<PlanLayout> {
  const elk = new ELK();
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const children = new Map<string, LayoutNode[]>();
  const actual = new Map<string, string>();
  let referenceId = 0;
  const visit = (tree: PlanTree, parentId?: string, pathLabel?: string) => {
    const id = tree.reference ? `reference:${referenceId++}` : `plan:${tree.id}`;
    const node: LayoutNode = {
      id,
      planNodeId: tree.id,
      parentId,
      reference: !!tree.reference,
      pathLabel,
      position: { x: 0, y: 0 },
      width: CARD_WIDTH,
      height: tree.reference ? 80 : HEADER_HEIGHT,
    };

    nodes.push(node);
    if (!tree.reference) actual.set(tree.id, id);
    const nested = tree.children.map((child) => visit(child, id));

    if (tree.then) {
      const target = visit(tree.then, id, 'YES / 条件成立');

      nested.push(target);
      edges.push({ id: `then:${id}`, source: id, target: target.id, kind: 'branch', label: 'YES' });
    }
    if (tree.otherwise) {
      const target = visit(tree.otherwise, id, 'NO / 条件不成立');

      nested.push(target);
      edges.push({
        id: `otherwise:${id}`,
        source: id,
        target: target.id,
        kind: 'branch',
        label: 'NO',
      });
    }
    children.set(id, nested);

    return node;
  };
  const roots = planForest(plan).map((tree) => visit(tree));

  for (const node of nodes) {
    if (node.reference) {
      edges.push({
        id: `ref:${node.id}`,
        source: node.id,
        target: actual.get(node.planNodeId)!,
        kind: 'reference',
        label: '引用',
      });
      continue;
    }
    for (const dependency of plan.nodes[node.planNodeId].dependsOn) {
      edges.push({
        id: `dep:${JSON.stringify([dependency, node.planNodeId])}`,
        source: actual.get(dependency)!,
        target: node.id,
        kind: 'dependency',
      });
    }
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const arrange = async (siblings: LayoutNode[], parent?: LayoutNode) => {
    for (const node of siblings) {
      const nested = children.get(node.id)!;

      if (nested.length) await arrange(nested, node);
    }
    const owner = (id: string): string | undefined => {
      let node = byId.get(id);

      while (node && node.parentId !== parent?.id)
        node = node.parentId ? byId.get(node.parentId) : undefined;

      return node?.id;
    };
    const links = new Map<string, { id: string; sources: string[]; targets: string[] }>();

    for (const edge of edges) {
      if (edge.kind !== 'dependency') continue;
      const source = owner(edge.source);
      const target = owner(edge.target);

      if (source && target && source !== target) {
        const id = JSON.stringify([source, target]);

        links.set(id, { id, sources: [source], targets: [target] });
      }
    }
    const graph = await elk.layout<ElkNode>({
      id: parent?.id ?? 'layout-root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction':
          parent && plan.nodes[parent.planNodeId].kind === 'branch' ? 'RIGHT' : 'DOWN',
        'elk.padding': parent
          ? `[top=${HEADER_HEIGHT + 24},left=24,bottom=24,right=24]`
          : '[top=0,left=0,bottom=0,right=0]',
        'elk.spacing.nodeNode': '32',
        'elk.layered.spacing.nodeNodeBetweenLayers': '48',
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.separateConnectedComponents': 'false',
      },
      children: siblings.map(({ id, width, height }) => ({ id, width, height })),
      edges: [...links.values()],
    });

    for (const item of graph.children ?? []) {
      byId.get(item.id)!.position = { x: item.x ?? 0, y: item.y ?? 0 };
    }
    if (parent) {
      parent.width = Math.max(CARD_WIDTH, graph.width ?? CARD_WIDTH);
      parent.height = graph.height ?? HEADER_HEIGHT;
    }
  };

  try {
    await arrange(roots);

    return { nodes, edges };
  } finally {
    elk.terminateWorker();
  }
}
