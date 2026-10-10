'use client';
import { Button } from '@/components/ui/Button';

import { memo } from 'react';
import type { Plan } from '@/automation/compiler/schema';
import type { ExecutionStep } from '@/workspace/types';
import type { PlanTree } from '@/workspace/planTree';

export const PlanNodes = memo(function PlanNodes({
  plan,
  forest,
  stepsByNode,
  selected,
  onSelect,
}: {
  plan: Plan;
  forest: PlanTree[];
  stepsByNode: Map<string, ExecutionStep[]>;
  selected?: string;
  onSelect: (id: string) => void;
}) {
  function render(tree: PlanTree) {
    const n = plan.nodes[tree.id];
    if (tree.reference)
      return (
        <Button key={tree.id} className="plan-reference" onClick={() => onSelect(tree.id)}>
          ↗ 引用 {tree.id}
        </Button>
      );
    const recorded = stepsByNode.get(n.id) || [];
    const state = recorded.some((s) => s.status === 'failed')
      ? 'failed'
      : recorded.some((s) => s.status === 'running')
        ? 'running'
        : recorded.length
          ? 'passed'
          : 'none';
    return (
      <div
        key={tree.id}
        data-plan-node={n.id}
        className={`plan-node ${n.kind} ${selected === n.id ? 'active' : ''}`}
      >
        <Button
          className="plan-node-header"
          onClick={() => onSelect(n.id)}
          aria-label={`查看节点 ${n.id}`}
        >
          <span className="flex items-center justify-between gap-4">
            <span className="font-mono text-xs tracking-wider text-page-muted">
              {n.kind.toUpperCase()} / {n.id}
            </span>
            {recorded.length > 0 && (
              <span className={`ws-status ${state}`}>
                <span />
                {recorded.length} 步
              </span>
            )}
          </span>
          <span className="mt-2 block text-left text-sm leading-6">
            {n.kind === 'branch' ? n.condition : n.goal}
          </span>
          {n.dependsOn.length > 0 && (
            <span className="mt-2 block text-left text-xs text-page-muted">
              依赖：{n.dependsOn.join(' · ')}
            </span>
          )}
          {n.kind === 'task' && (
            <span className="mt-2 block text-left text-xs text-page-muted">
              {n.assertions.length} 个预期
              {n.requirementIds.length ? ` · ${n.requirementIds.join(', ')}` : ''}
            </span>
          )}
        </Button>
        {n.kind === 'group' && <div className="plan-children">{tree.children.map(render)}</div>}
        {n.kind === 'branch' && (
          <div className="plan-branches">
            <div>
              <p className="mb-3 font-mono text-xs text-[#6c805b]">YES / 条件成立</p>
              {tree.then && render(tree.then)}
            </div>
            <div>
              <p className="mb-3 font-mono text-xs text-page-muted">NO / 条件不成立</p>
              {tree.otherwise ? (
                render(tree.otherwise)
              ) : (
                <p className="text-xs text-page-muted">跳过</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <>
      {forest.map((tree, index) => (
        <div key={tree.id}>
          {index > 0 && <p className="mb-3 text-xs text-page-muted">依赖 / 独立节点</p>}
          {render(tree)}
        </div>
      ))}
    </>
  );
});
