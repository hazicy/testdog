import { describe, expect, it } from 'vitest';
import { PlanSchema, type Plan } from '@/automation/compiler/schema';
import { emptyPlan, insertStep } from './authoring';
import { duplicateNode, moveNode, removeNode, updateNodeContent } from './planEditing';

function fixture(): Plan {
  let plan = emptyPlan('用例');

  plan = insertStep(plan, { groupId: 'root', index: 0 }, 'act', 'a');
  plan = insertStep(plan, { groupId: 'root', index: 1 }, 'assert', 'b');

  return plan;
}

describe('canvas operations', () => {
  it('reorders within and across groups, while rejecting cycles', () => {
    const plan = insertStep(fixture(), { groupId: 'root', index: 2 }, 'group', 'group');
    const reordered = moveNode(plan, 'a', { groupId: 'root', index: 2 });

    expect(reordered.nodes.root).toMatchObject({ children: ['b', 'a', 'group'] });
    expect(moveNode(reordered, 'a', { groupId: 'group', index: 0 }).nodes.group).toMatchObject({
      children: ['a'],
    });
    expect(() => moveNode(plan, 'group', { groupId: 'group', index: 0 })).toThrow();
    expect(plan.nodes.root).toMatchObject({ children: ['a', 'b', 'group'] });
  });

  it('duplicates complete branch subtrees with independent IDs and internal dependencies', () => {
    let plan = insertStep(fixture(), { groupId: 'root', index: 2 }, 'branch', 'branch');

    plan = insertStep(plan, { groupId: 'branch:then', index: 0 }, 'act', 'child');
    const copied = duplicateNode(plan, 'branch');
    const root = copied.nodes.root;

    if (root.kind !== 'group') throw new Error('Missing root');
    const branch = copied.nodes[root.children[3]];

    expect(branch.id).not.toBe('branch');
    if (branch.kind !== 'branch') throw new Error('Missing branch');
    expect(branch.then).not.toBe('branch:then');
    const path = copied.nodes[branch.then];

    if (path.kind !== 'group') throw new Error('Missing path');
    expect(path.children[0]).not.toBe('child');
    expect(copied.nodes[path.children[0]]).toMatchObject({ actionType: 'act' });
    expect(PlanSchema.safeParse(copied).success).toBe(true);
  });

  it('removes a subtree but preserves shared descendants and valid empty branch paths', () => {
    let plan = insertStep(fixture(), { groupId: 'root', index: 2 }, 'branch', 'branch');

    plan = insertStep(plan, { groupId: 'branch:then', index: 0 }, 'act', 'shared');
    plan.nodes.b.dependsOn = ['shared'];
    const removed = removeNode(plan, 'branch');

    expect(removed.nodes.branch).toBeUndefined();
    expect(removed.nodes.shared).toBeDefined();
    expect(removeNode(plan, 'branch:then').nodes['branch:then']).toMatchObject({ children: [] });
    expect(removeNode(plan, 'root')).toBe(plan);
  });

  it('keeps assertion semantics synchronized with inline content', () => {
    expect(updateNodeContent(fixture(), 'b', '登录成功').nodes.b).toMatchObject({
      goal: '登录成功',
      assertions: [{ description: '登录成功' }],
    });
    expect(() => updateNodeContent(fixture(), 'b', '')).toThrow();
  });
});
