import { expect, it } from 'vitest';
import { PlanSchema } from '@testdog/contracts/automation/compiler/schema';
import { layoutPlan } from '@/features/runs/lib/planLayout';
import { emptyPlan, insertStep } from '@/features/test-cases/lib/authoring';

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
      if (node === other) continue;
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

const group = (id: string, children: string[] = []) => ({
  id,
  kind: 'group',
  goal: id,
  children,
  dependsOn: [],
});

it('places consecutive groups in columns and reserves the full subtree width and height', () => {
  const plan = PlanSchema.parse({
    rootId: 'root',
    nodes: {
      root: group('root', ['left', 'right', 'after']),
      left: group('left', ['branch']),
      right: group('right', ['short']),
      branch: {
        id: 'branch',
        kind: 'branch',
        condition: 'Ready?',
        then: 'yes',
        otherwise: 'no',
        dependsOn: [],
      },
      yes: task('yes'),
      no: task('no'),
      short: task('short'),
      after: task('after'),
    },
  });
  const original = structuredClone(plan);
  const layout = layoutPlan(plan);
  const row = (id: string) => layout.nodes.find((node) => node.planNodeId === id)!;

  expect(row('left').position.y).toBe(row('right').position.y);
  expect(row('right').position.x).toBeGreaterThan(row('no').position.x + row('no').width);
  expect(row('after').position.y).toBeGreaterThan(row('no').position.y + row('no').height);
  expect(row('root').position.x + row('root').width / 2).toBe(
    (row('right').position.x + row('right').width) / 2,
  );
  expect(
    layout.edges
      .filter((edge) => edge.kind === 'sequence' && edge.target === 'plan:after')
      .map((edge) => edge.source),
  ).toEqual(['plan:yes', 'plan:no', 'plan:short']);
  expect(
    layout.insertions.find((slot) => slot.groupId === 'root' && slot.index === 0),
  ).toMatchObject({
    anchorId: 'plan:root',
    position: { x: row('root').position.x + row('root').width / 2 - 18 },
  });
  expect(layout.edges).toContainEqual(
    expect.objectContaining({
      source: row('root').id,
      target: row('right').id,
      kind: 'containment',
    }),
  );
  expect(
    layout.insertions.filter((slot) => slot.groupId === 'root').map((slot) => slot.index),
  ).toEqual([0, 3]);
  expect(plan).toEqual(original);
  expect(layoutPlan(plan)).toEqual(layout);
});

it('keeps hidden sequence groups vertical, including their following siblings', () => {
  const layout = layoutPlan(
    PlanSchema.parse({
      rootId: 'root',
      nodes: {
        root: group('root', ['first', 'second']),
        first: { ...group('first', ['a']), presentation: 'sequence' },
        second: { ...group('second', ['b']), presentation: 'sequence' },
        a: task('a'),
        b: task('b'),
      },
    }),
  );
  const a = layout.nodes.find((node) => node.planNodeId === 'a')!;
  const b = layout.nodes.find((node) => node.planNodeId === 'b')!;

  expect(a.position.x).toBe(b.position.x);
  expect(b.position.y).toBeGreaterThan(a.position.y + a.height);
  expect(
    layout.nodes.some((node) => node.planNodeId === 'first' || node.planNodeId === 'second'),
  ).toBe(false);
});

it.each([true, false])(
  'merges branch exits before subsequent steps (otherwise: %s)',
  (otherwise) => {
    const layout = layoutPlan(
      PlanSchema.parse({
        rootId: 'root',
        nodes: {
          root: group('root', ['branch', 'after']),
          branch: {
            id: 'branch',
            kind: 'branch',
            condition: 'Ready?',
            then: 'yes',
            ...(otherwise ? { otherwise: 'no' } : {}),
            dependsOn: [],
          },
          yes: task('yes'),
          ...(otherwise ? { no: task('no') } : {}),
          after: task('after', ['branch']),
        },
      }),
    );

    for (const kind of ['sequence', 'dependency'])
      expect(
        layout.edges
          .filter((edge) => edge.kind === kind && edge.target === 'plan:after')
          .map((edge) => edge.source),
      ).toEqual(['plan:yes', otherwise ? 'plan:no' : 'plan:branch']);
  },
);

it('connects groups inserted at the parent first slot to that parent, not to their sibling', () => {
  let plan = emptyPlan('Root');

  plan = insertStep(plan, { groupId: 'root', index: 0 }, 'group', 'existing');
  plan = insertStep(plan, { groupId: 'root', index: 0 }, 'group', 'new');
  plan = insertStep(plan, { groupId: 'new', index: 0 }, 'act', 'child');
  const layout = layoutPlan(plan);

  for (const target of ['plan:new', 'plan:existing']) {
    expect(layout.edges.filter((edge) => edge.target === target)).toEqual([
      expect.objectContaining({ source: 'plan:root', target, kind: 'containment' }),
    ]);
  }

  expect(layout.edges).toContainEqual(
    expect.objectContaining({ source: 'plan:new', target: 'plan:child', kind: 'sequence' }),
  );
  expect(plan.nodes.root).toMatchObject({ children: ['new', 'existing'] });
});

it('shows exactly one insertion per visible group, with none between or after sibling groups', () => {
  const layout = layoutPlan(
    PlanSchema.parse({
      rootId: 'root',
      nodes: {
        root: group('root', ['left', 'right']),
        left: group('left'),
        right: group('right'),
      },
    }),
  );

  expect(layout.insertions.map(({ groupId, index }) => ({ groupId, index }))).toEqual([
    { groupId: 'root', index: 0 },
    { groupId: 'left', index: 0 },
    { groupId: 'right', index: 0 },
  ]);
});

it('does not duplicate insertion points at hidden sequence boundaries', () => {
  const layout = layoutPlan(
    PlanSchema.parse({
      rootId: 'root',
      nodes: {
        root: group('root', ['hidden']),
        hidden: { ...group('hidden', ['a', 'b']), presentation: 'sequence' },
        a: task('a'),
        b: task('b'),
      },
    }),
  );

  expect(layout.insertions.map(({ groupId, index }) => ({ groupId, index }))).toEqual([
    { groupId: 'root', index: 0 },
    { groupId: 'hidden', index: 1 },
    { groupId: 'hidden', index: 2 },
  ]);
  const positions = layout.insertions.map((slot) => JSON.stringify(slot.position));

  expect(new Set(positions).size).toBe(positions.length);
});

it('reserves space for multiline Chinese content and long shared references', () => {
  const plan = PlanSchema.parse({
    rootId: 'root',
    nodes: {
      root: group('root', ['long', 'branch', 'after']),
      long: {
        ...task('long'),
        goal: '检查页面上的订单信息与用户信息是否正确'.repeat(8) + '\n第二行\n第三行',
      },
      branch: {
        id: 'branch',
        kind: 'branch',
        condition: '是否重试？',
        then: 'long',
        dependsOn: [],
      },
      after: task('after'),
    },
  });
  const layout = layoutPlan(plan);
  const long = layout.nodes.find((node) => node.id === 'plan:long')!;
  const reference = layout.nodes.find((node) => node.reference)!;
  const after = layout.nodes.find((node) => node.id === 'plan:after')!;

  expect(long.height).toBeGreaterThan(160);
  expect(reference.height).toBeGreaterThanOrEqual(long.height);
  expect(after.position.y).toBeGreaterThan(reference.position.y + reference.height);
});
