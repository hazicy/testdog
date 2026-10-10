import { expect, it } from 'vitest';
import { PlanSchema } from '@/automation/compiler/schema';
import { editablePlan, emptyPlan, insertStep, planText } from './authoring';

it('splits assertions into independent editable steps without changing dependency completion boundaries', () => {
  const source = PlanSchema.parse({
    rootId: 'root',
    nodes: {
      root: { id: 'root', kind: 'group', goal: '登录', children: ['login', 'next'], dependsOn: [] },
      login: {
        id: 'login',
        kind: 'task',
        goal: '点击登录',
        dependsOn: [],
        requirementIds: ['R1'],
        assertions: [{ description: '表单可见' }],
      },
      next: {
        id: 'next',
        kind: 'task',
        goal: '输入邮箱',
        dependsOn: ['login'],
        requirementIds: [],
        assertions: [],
      },
    },
  });
  const plan = editablePlan(source);

  expect(plan.nodes.login).toMatchObject({
    kind: 'group',
    presentation: 'sequence',
    children: ['login:act', 'login:assert:1'],
  });
  expect(plan.nodes['login:act']).toMatchObject({
    actionType: 'act',
    requirementIds: ['R1'],
    assertions: [],
  });
  expect(plan.nodes['login:assert:1']).toMatchObject({
    actionType: 'assert',
    goal: '表单可见',
    assertions: [{ description: '表单可见' }],
  });
  expect(plan.nodes.next.dependsOn).toEqual(['login']);
  expect(editablePlan(plan)).toEqual(plan);
  expect(source.nodes.login.kind).toBe('task');
});

it('inserts all step types at the requested position and preserves them in text output', () => {
  let plan = emptyPlan('用例');

  for (const [index, type] of (
    ['act', 'assert', 'login', 'files', 'screenshot'] as const
  ).entries())
    plan = insertStep(plan, { groupId: 'root', index }, type, type);
  plan = insertStep(plan, { groupId: 'root', index: 1 }, 'act', 'middle');
  expect(plan.nodes.root).toMatchObject({
    children: ['act', 'middle', 'assert', 'login', 'files', 'screenshot'],
  });
  for (const type of ['act', 'assert', 'login', 'files', 'screenshot'])
    expect(planText(plan)).toContain(`${type}:`);
  plan = insertStep(plan, { groupId: 'root', index: 0 }, 'branch', 'branch');
  expect(plan.nodes.branch).toMatchObject({ then: 'branch:then', otherwise: 'branch:otherwise' });
  expect(
    insertStep(plan, { groupId: 'branch:then', index: 0 }, 'assert', 'branch-check').nodes[
      'branch:then'
    ],
  ).toMatchObject({ children: ['branch-check'] });
});
