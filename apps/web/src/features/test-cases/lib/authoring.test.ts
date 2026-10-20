import en from '../../../../messages/en.json';
import { expect, it } from 'vitest';
import { PlanSchema } from '@testdog/contracts/execution/plan';
import {
  editablePlan,
  emptyPlan,
  insertStep,
  planText,
  caseName,
} from '@/features/test-cases/lib/authoring';

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

it('rejects invalid insertion positions and existing IDs without overwriting nodes', () => {
  const plan = emptyPlan('Root');

  for (const index of [-1, 1, 0.5])
    expect(() => insertStep(plan, { groupId: 'root', index }, 'act', 'new')).toThrow();
  expect(() => insertStep(plan, { groupId: 'root', index: 0 }, 'act', 'root')).toThrow();
  expect(plan.nodes.root).toMatchObject({ children: [] });
});

it('uses localized defaults without rewriting existing authored content', () => {
  const labels = en.authoring;
  const plan = insertStep(
    emptyPlan('', labels),
    { groupId: 'root', index: 0 },
    'branch',
    'branch',
    labels,
  );

  expect(plan.nodes.root).toMatchObject({ goal: 'Test case' });
  expect(plan.nodes.branch).toMatchObject({ condition: 'Describe the branch condition' });
  expect(plan.nodes['branch:then']).toMatchObject({ goal: 'Condition true' });
  expect(planText(plan, labels)).toContain('If: Describe the branch condition');
  expect(caseName('', 'en', labels)).toMatch(/^New test /);
  expect(caseName('现有测试', 'en', labels)).toBe('现有测试');
  const source = emptyPlan('用户填写的名称');

  expect(editablePlan(source, undefined, labels).nodes.root).toMatchObject({
    goal: '用户填写的名称',
  });
});
