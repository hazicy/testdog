import { describe, expect, it } from 'vitest';
import {
  PlanSchema,
  type Plan,
  type PlanNode,
} from '@testdog/contracts/automation/compiler/schema';
import { reviewPlan, resolveReview } from '@/features/test-cases/lib/planReview';

const task = (
  id: string,
  goal: string,
  dependsOn: string[] = [],
): Extract<PlanNode, { kind: 'task' }> => ({
  id,
  kind: 'task',
  actionType: 'act',
  goal,
  dependsOn,
  requirementIds: [],
  assertions: [],
});
const plan = (nodes: PlanNode[], children = nodes.map((node) => node.id)): Plan => ({
  rootId: 'root',
  nodes: Object.fromEntries(
    [{ id: 'root', kind: 'group', goal: '测试', children, dependsOn: [] }, ...nodes].map((node) => [
      node.id,
      node,
    ]),
  ) as Plan['nodes'],
});
const all = (review: ReturnType<typeof reviewPlan>, accept: boolean) =>
  Object.fromEntries(review.changes.map((change) => [change.id, accept]));

describe('plan review', () => {
  it('accepts an edit and rejects an independent addition without changing other steps', () => {
    const before = plan([task('a', '打开首页'), task('b', '点击登录')]);
    const after = plan([
      task('a', '打开首页'),
      task('b', '点击邮箱登录'),
      task('c', '验证账号名称'),
    ]);
    const review = reviewPlan(before, after);

    expect(review.changes.map((change) => [change.id, change.kind])).toEqual([
      ['b', 'modified'],
      ['c', 'added'],
    ]);
    expect(resolveReview(review, { b: true, c: false })).toEqual(
      plan([task('a', '打开首页'), task('b', '点击邮箱登录')]),
    );
    expect(resolveReview(review, all(review, false))).toEqual(before);
    expect(resolveReview(review, all(review, true))).toEqual(PlanSchema.parse(after));
  });

  it('preserves insertion positions and restores rejected deletions in the original position', () => {
    const before = plan([task('a', '首页'), task('b', '登录'), task('c', '退出')]);
    const after = plan([
      task('a', '首页'),
      task('new', '验证账号'),
      task('c', '退出'),
      task('extra', '截图'),
    ]);
    const review = reviewPlan(before, after);
    const decisions = Object.fromEntries(
      review.changes.map((change) => [change.id, change.kind !== 'removed']),
    );
    const result = resolveReview(review, decisions);

    expect(result.nodes.root.kind).toBe('group');
    expect((result.nodes.root as Extract<PlanNode, { kind: 'group' }>).children).toEqual([
      'a',
      'new',
      'b',
      'c',
      'extra',
    ]);
  });

  it('aligns regenerated IDs and leaves equal content without review actions', () => {
    const before = plan([task('a', '首页'), task('b', '登录')]);
    const review = reviewPlan(before, plan([task('one', '首页'), task('two', '邮箱登录')]));

    expect(review.changes).toHaveLength(1);
    expect(review.changes[0]).toMatchObject({ id: 'b', kind: 'modified' });
    expect(resolveReview(review, { b: false })).toEqual(before);
  });

  it('groups reorder operations while allowing an unrelated content change', () => {
    const before = plan([task('a', '首页'), task('b', '登录'), task('c', '退出')]);
    const review = reviewPlan(
      before,
      plan([task('b', '登录'), task('a', '首页'), task('c', '注销')]),
    );
    const reorder = review.changes.find((change) => change.nodeIds.includes('a'))!;

    expect(reorder.nodeIds).toContain('b');
    const result = resolveReview(review, { [reorder.id]: false, c: true });

    expect((result.nodes.root as Extract<PlanNode, { kind: 'group' }>).children).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(result.nodes.c).toMatchObject({ goal: '注销' });
  });

  it('keeps newly added branch paths and dependencies together', () => {
    const before = plan([task('a', '首页')]);
    const branch: PlanNode = {
      id: 'branch',
      kind: 'branch',
      condition: '已登录',
      then: 'yes',
      otherwise: 'no',
      dependsOn: [],
    };
    const after = plan(
      [
        task('a', '首页'),
        branch,
        task('yes', '退出'),
        task('no', '登录'),
        task('check', '验证结果', ['branch']),
      ],
      ['a', 'branch', 'check'],
    );
    const review = reviewPlan(before, after);

    expect(review.changes).toHaveLength(1);
    expect(review.changes[0].nodeIds.sort()).toEqual(['branch', 'check', 'no', 'yes']);
    expect(resolveReview(review, all(review, false))).toEqual(before);
    expect(resolveReview(review, all(review, true))).toEqual(PlanSchema.parse(after));
  });
});

it('reviews generated action and assertion cards independently inside sequence wrappers', () => {
  const before = plan([]);
  const after = plan(
    [
      {
        id: 'sequence',
        kind: 'group',
        presentation: 'sequence',
        goal: '登录',
        children: ['action', 'assert'],
        dependsOn: [],
      },
      task('action', '点击登录'),
      {
        ...task('assert', '显示表单'),
        actionType: 'assert',
        assertions: [{ description: '显示表单' }],
      },
    ],
    ['sequence'],
  );
  const review = reviewPlan(before, after);

  expect(review.changes.map((change) => change.id)).toEqual(['action', 'assert']);
  expect(resolveReview(review, all(review, false))).toEqual(before);
  const result = resolveReview(review, { action: true, assert: false });

  expect(result.nodes.sequence).toMatchObject({ children: ['action'] });
  expect(result.nodes.assert).toBeUndefined();
  expect(() => PlanSchema.parse(result)).not.toThrow();
});
