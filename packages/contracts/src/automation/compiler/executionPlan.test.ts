import { expect, it } from 'vitest';
import {
  ExecutablePlanSchema,
  PlanSchema,
  type Plan,
} from '@testdog/contracts/automation/compiler/schema';
import { resolvePlanInputs } from '@testdog/contracts/automation/compiler/executionPlan';

const plan: Plan = {
  rootId: 'root',
  nodes: {
    root: {
      id: 'root',
      kind: 'group',
      goal: '测试 ${input.name}',
      children: ['branch'],
      dependsOn: [],
    },
    branch: {
      id: 'branch',
      kind: 'branch',
      condition: '显示 ${input.name}',
      then: 'task',
      dependsOn: [],
    },
    task: {
      id: 'task',
      kind: 'task',
      goal: '填写 ${input.password}',
      dependsOn: [],
      requirementIds: ['R1'],
      assertions: [{ description: '欢迎 ${input.name}' }],
    },
  },
};

it('resolves all execution text without changing source IDs, dependencies or secret values', () => {
  const result = resolvePlanInputs(plan, {
    name: { value: 'Ada' },
    password: { secretRef: 'PASSWORD' },
  });

  expect(result.nodes.root).toMatchObject({ goal: '测试 Ada', children: ['branch'] });
  expect(result.nodes.branch).toMatchObject({ condition: '显示 Ada', then: 'task' });
  expect(result.nodes.task).toMatchObject({
    goal: '填写 ${secret:PASSWORD}',
    requirementIds: ['R1'],
    assertions: [{ description: '欢迎 Ada' }],
  });
  expect(plan.nodes.task).toMatchObject({ goal: '填写 ${input.password}' });
  expect(() => resolvePlanInputs(plan)).toThrow('缺少输入引用');
});

it('allows empty drafts but rejects unreachable tasks as executable cases', () => {
  const empty: Plan = {
    rootId: 'root',
    nodes: { root: { id: 'root', kind: 'group', goal: '草稿', dependsOn: [], children: [] } },
  };

  expect(PlanSchema.safeParse(empty).success).toBe(true);
  expect(ExecutablePlanSchema.safeParse(empty).success).toBe(false);
  expect(
    ExecutablePlanSchema.safeParse({ ...empty, nodes: { ...empty.nodes, task: plan.nodes.task } })
      .success,
  ).toBe(false);
});

it('rejects assertion tasks that would otherwise execute no checks', () => {
  expect(() =>
    ExecutablePlanSchema.parse({
      rootId: 'task',
      nodes: { task: { ...plan.nodes.task, actionType: 'assert', assertions: [] } },
    }),
  ).toThrow('验证步骤缺少预期结果');
});

it('rejects disconnected work even when the root already contains executable steps', () => {
  const source: Plan = {
    ...plan,
    nodes: {
      ...plan.nodes,
      task: { ...plan.nodes.task, dependsOn: [] },
      detached: { ...plan.nodes.task, id: 'detached' },
    },
  };

  expect(PlanSchema.safeParse(source).success).toBe(true);
  expect(() => ExecutablePlanSchema.parse(source)).toThrow('步骤未连接到测试入口：detached');
  source.nodes.task.dependsOn.push('detached');
  expect(ExecutablePlanSchema.safeParse(source).success).toBe(true);
});

it('rejects dependencies that would execute an unselected branch path', () => {
  const source: Plan = {
    ...plan,
    nodes: {
      ...plan.nodes,
      root: {
        ...plan.nodes.root,
        kind: 'group',
        goal: '测试',
        children: ['branch', 'after'],
        dependsOn: [],
      },
      after: { ...plan.nodes.task, id: 'after', dependsOn: ['task'] },
    },
  };

  expect(PlanSchema.safeParse(source).success).toBe(true);
  expect(() => ExecutablePlanSchema.parse(source)).toThrow('请依赖分支节点');
  source.nodes.after.dependsOn = ['branch'];
  expect(ExecutablePlanSchema.safeParse(source).success).toBe(true);
  if (source.nodes.root.kind === 'group') source.nodes.root.children.push('task');
  expect(() => ExecutablePlanSchema.parse(source)).toThrow('请依赖分支节点');
});

it('allows dependencies within the same path and shared work in both branch paths', () => {
  const source: Plan = {
    rootId: 'branch',
    nodes: {
      branch: {
        ...plan.nodes.branch,
        kind: 'branch',
        condition: '条件',
        then: 'then',
        otherwise: 'other',
        dependsOn: [],
      },
      then: {
        id: 'then',
        kind: 'group',
        goal: '成立',
        children: ['shared', 'task'],
        dependsOn: [],
      },
      other: { id: 'other', kind: 'group', goal: '否则', children: ['shared'], dependsOn: [] },
      shared: { ...plan.nodes.task, id: 'shared', dependsOn: [] },
      task: { ...plan.nodes.task, dependsOn: ['shared'] },
    },
  };

  expect(ExecutablePlanSchema.safeParse(source).success).toBe(true);
  source.nodes.shared.dependsOn = ['task'];
  expect(ExecutablePlanSchema.safeParse(source).success).toBe(false);
});
