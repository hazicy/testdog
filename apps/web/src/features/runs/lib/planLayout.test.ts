import { expect, it } from 'vitest';
import { PlanSchema } from '@testdog/contracts/execution/plan';
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
    pathLabel: 'yesCondition',
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

it('lays out sibling groups and merges their exits before the following step', () => {
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

  for (const id of ['left', 'right'])
    expect(row(id).position.y).toBeGreaterThan(row('root').position.y + row('root').height);
  expect(row('after').position.y).toBeGreaterThan(row('no').position.y + row('no').height);
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
  ).toEqual([0, 1, 2, 3]);
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

it('distinguishes child insertion below a group from sibling insertion beside it', () => {
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
    { groupId: 'root', index: 1 },
    { groupId: 'right', index: 0 },
    { groupId: 'root', index: 2 },
  ]);
  for (const slot of layout.insertions) {
    const anchor = layout.nodes.find((node) => node.id === slot.anchorId)!;

    if (slot.placement === 'beside') {
      expect(slot.position.x).toBeGreaterThan(anchor.position.x + anchor.width);
      expect(slot.position.y + 18).toBe(anchor.position.y + anchor.height / 2);
    } else expect(slot.position.y).toBeGreaterThan(anchor.position.y + anchor.height);
    for (const node of layout.nodes)
      expect(
        slot.position.x + 36 <= node.position.x ||
          slot.position.x >= node.position.x + node.width ||
          slot.position.y + 36 <= node.position.y ||
          slot.position.y >= node.position.y + node.height,
        `${slot.id} overlaps ${node.id}`,
      ).toBe(true);
  }
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
    { groupId: 'root', index: 1 },
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

it('keeps groups below preceding steps without adding sibling containment edges', () => {
  const layout = layoutPlan(
    PlanSchema.parse({
      rootId: 'root',
      nodes: {
        root: group('root', ['before', 'left', 'right', 'after']),
        before: task('before'),
        left: group('left', ['child']),
        right: group('right'),
        child: task('child'),
        after: task('after'),
      },
    }),
  );
  const row = (id: string) => layout.nodes.find((node) => node.planNodeId === id)!;

  for (const id of ['left', 'right']) {
    expect(row(id).position.y).toBeGreaterThan(row('before').position.y + row('before').height);
    expect(layout.edges.filter((edge) => edge.target === row(id).id)).toEqual([
      expect.objectContaining({ source: 'plan:root', kind: 'containment' }),
    ]);
  }

  for (const id of ['child', 'right'])
    expect(row('after').position.y).toBeGreaterThan(row(id).position.y + row(id).height);
});

it('uses cross-group dependencies to position nodes in execution order', () => {
  const layout = layoutPlan(
    PlanSchema.parse({
      rootId: 'root',
      nodes: {
        root: group('root', ['left', 'right']),
        left: group('left', ['consumer']),
        right: group('right', ['producer']),
        consumer: task('consumer', ['producer']),
        producer: task('producer'),
      },
    }),
  );
  const producer = layout.nodes.find((node) => node.planNodeId === 'producer')!;
  const consumer = layout.nodes.find((node) => node.planNodeId === 'consumer')!;

  expect(consumer.position.y).toBeGreaterThan(producer.position.y + producer.height);
});

it.each([false, true])(
  'separates branch sibling insertion from its path insertions (results: %s)',
  (results) => {
    const plan = PlanSchema.parse({
      rootId: 'root',
      nodes: {
        root: group('root', ['branch', 'after']),
        branch: {
          id: 'branch',
          kind: 'branch',
          condition: 'Ready?',
          then: 'yes',
          otherwise: 'no',
          dependsOn: [],
        },
        yes: task('yes'),
        no: { ...task('no'), goal: '检查订单信息是否正确'.repeat(40) },
        after: task('after'),
      },
    });
    const layout = layoutPlan(plan, results);
    const insertion = layout.insertions.find(
      (slot) => slot.groupId === 'root' && slot.index === 1,
    )!;
    const branch = layout.nodes.find((node) => node.planNodeId === 'branch')!;

    expect(insertion.placement).toBe('beside');
    expect(insertion.anchorId).toBe(branch.id);
    expect(insertion.position.x).toBeGreaterThan(branch.position.x + branch.width);
    expect(insertion.position.y + 18).toBe(branch.position.y + branch.height / 2);
    for (const node of layout.nodes)
      expect(
        insertion.position.x + 36 <= node.position.x ||
          insertion.position.x >= node.position.x + node.width ||
          insertion.position.y + 36 <= node.position.y ||
          insertion.position.y >= node.position.y + node.height,
        `${insertion.id} overlaps ${node.id}`,
      ).toBe(true);
  },
);

it('exposes parent slots after hidden sequences while preserving internal gaps', () => {
  const layout = layoutPlan(
    PlanSchema.parse({
      rootId: 'root',
      nodes: {
        root: group('root', ['first', 'second']),
        first: { ...group('first', ['action', 'assertion']), presentation: 'sequence' },
        second: { ...group('second', ['last']), presentation: 'sequence' },
        action: task('action'),
        assertion: task('assertion'),
        last: task('last'),
      },
    }),
  );

  expect(layout.insertions.map(({ groupId, index }) => ({ groupId, index }))).toEqual([
    { groupId: 'root', index: 0 },
    { groupId: 'first', index: 1 },
    { groupId: 'root', index: 1 },
    { groupId: 'root', index: 2 },
  ]);
  expect(new Set(layout.insertions.map((slot) => slot.id)).size).toBe(layout.insertions.length);
});

it('keeps nested branch sibling and empty-path insertion targets separate', () => {
  let plan = insertStep(emptyPlan('Root'), { groupId: 'root', index: 0 }, 'branch', 'outer');

  plan = insertStep(plan, { groupId: 'outer:then', index: 0 }, 'branch', 'inner');
  const layout = layoutPlan(plan);

  for (const slot of layout.insertions) {
    for (const other of [...layout.nodes, ...layout.insertions]) {
      if (slot === other) continue;
      const width = 'width' in other ? other.width : 36;
      const height = 'height' in other ? other.height : 36;

      expect(
        slot.position.x + 36 <= other.position.x ||
          slot.position.x >= other.position.x + width ||
          slot.position.y + 36 <= other.position.y ||
          slot.position.y >= other.position.y + height,
        `${slot.id} overlaps ${other.id}`,
      ).toBe(true);
    }
  }
});
