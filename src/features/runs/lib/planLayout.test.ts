import { expect, it } from 'vitest';
import { PlanSchema } from '@/automation/compiler/schema';
import { layoutPlan } from './planLayout';

const task = (id: string, dependsOn: string[] = []) => ({
  id,
  kind: 'task',
  goal: id,
  dependsOn,
  requirementIds: [],
  assertions: [],
});

it('lays out nested groups, shared branch targets and cross-group dependencies without overlap', async () => {
  const plan = PlanSchema.parse({
    rootId: 'root',
    nodes: {
      root: {
        id: 'root',
        kind: 'group',
        goal: 'Root',
        children: ['nested', 'branch'],
        dependsOn: ['external'],
      },
      nested: {
        id: 'nested',
        kind: 'group',
        goal: 'Nested',
        children: ['open', 'shared'],
        dependsOn: [],
      },
      open: task('open'),
      shared: task('shared', ['open']),
      branch: {
        id: 'branch',
        kind: 'branch',
        condition: 'Signed in?',
        then: 'shared',
        otherwise: 'login',
        dependsOn: ['shared'],
      },
      login: task('login'),
      external: task('external'),
      independent: task('independent'),
    },
  });
  const { nodes, edges } = await layoutPlan(plan);
  const byId = new Map(nodes.map((node) => [node.id, node]));

  expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length);
  expect(nodes.filter((node) => !node.reference)).toHaveLength(Object.keys(plan.nodes).length);
  for (const node of nodes) {
    expect(Number.isFinite(node.position.x) && Number.isFinite(node.position.y)).toBe(true);
    for (const other of nodes) {
      if (node === other || node.parentId !== other.parentId) continue;
      const separated =
        node.position.x + node.width <= other.position.x ||
        other.position.x + other.width <= node.position.x ||
        node.position.y + node.height <= other.position.y ||
        other.position.y + other.height <= node.position.y;

      expect(separated, `${node.id} overlaps ${other.id}`).toBe(true);
    }
  }

  const reference = nodes.find((node) => node.reference)!;

  expect(reference).toMatchObject({
    planNodeId: 'shared',
    pathLabel: 'YES / 条件成立',
  });
  expect(edges).toContainEqual(
    expect.objectContaining({ source: reference.id, target: 'plan:shared', kind: 'reference' }),
  );
  expect(edges.filter((edge) => edge.kind === 'branch').map((edge) => edge.label)).toEqual([
    'YES',
    'NO',
  ]);
  expect(edges).toContainEqual(
    expect.objectContaining({ source: 'plan:shared', target: 'plan:branch', kind: 'dependency' }),
  );
  expect(edges).toContainEqual(
    expect.objectContaining({ source: 'plan:external', target: 'plan:root', kind: 'dependency' }),
  );
  expect(byId.get('plan:external')!.position.y + byId.get('plan:external')!.height).toBeLessThan(
    byId.get('plan:root')!.position.y,
  );
});

it('handles a task root and a branch without an otherwise path', async () => {
  const single = await layoutPlan(
    PlanSchema.parse({ rootId: 'only', nodes: { only: task('only') } }),
  );

  expect(single.nodes).toHaveLength(1);
  expect(single.edges).toEqual([]);
  const branch = await layoutPlan(
    PlanSchema.parse({
      rootId: 'branch',
      nodes: {
        branch: { id: 'branch', kind: 'branch', condition: 'Ready?', then: 'only', dependsOn: [] },
        only: task('only'),
      },
    }),
  );

  expect(branch.nodes).toHaveLength(2);
  expect(branch.edges).toHaveLength(1);
  expect(branch.edges[0]).toMatchObject({ label: 'YES', target: 'plan:only' });
});

it('connects group children vertically in authored execution order', async () => {
  const plan = PlanSchema.parse({
    rootId: 'root',
    nodes: {
      root: { id: 'root', kind: 'group', goal: '流程', children: ['b', 'a'], dependsOn: [] },
      a: task('a'),
      b: task('b'),
    },
  });
  const layout = await layoutPlan(plan);
  const a = layout.nodes.find((node) => node.planNodeId === 'a')!;
  const b = layout.nodes.find((node) => node.planNodeId === 'b')!;

  expect(b.position.y + b.height).toBeLessThan(a.position.y);
  expect(layout.edges).toContainEqual(
    expect.objectContaining({ source: b.id, target: a.id, kind: 'sequence' }),
  );
});
