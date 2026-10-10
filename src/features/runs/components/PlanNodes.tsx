'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Button } from '@/components/ui/Button';
import type { PlanNode } from '@/automation/compiler/schema';
import type { ExecutionStep } from '@/workspace/types';

export type PlanFlowNode = Node<
  {
    node: PlanNode;
    reference: boolean;
    pathLabel?: string;
    steps: ExecutionStep[];
    active: boolean;
    onSelect: (id: string) => void;
  },
  'plan'
>;

export const PlanNodes = memo(function PlanNodes({ data }: NodeProps<PlanFlowNode>) {
  const { node: n, steps, onSelect } = data;
  const state = steps.some((s) => s.status === 'failed')
    ? 'failed'
    : steps.some((s) => s.status === 'running')
      ? 'running'
      : steps.length
        ? 'passed'
        : 'none';

  return (
    <div
      data-plan-node={n.id}
      className={`plan-node ${n.kind} ${data.reference ? 'reference' : ''} ${data.active ? 'active' : ''}`}
    >
      <Handle type="target" position={Position.Left} style={{ top: 28 }} isConnectable={false} />
      <Handle type="source" position={Position.Right} style={{ top: 28 }} isConnectable={false} />
      <Button
        className="plan-node-header nodrag pointer-events-auto"
        onClick={() => onSelect(n.id)}
        aria-label={data.reference ? `查看引用节点 ${n.id}` : `查看节点 ${n.id}`}
      >
        {data.pathLabel && (
          <span className="mb-2 block text-xs text-page-muted">{data.pathLabel}</span>
        )}
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-xs tracking-wider text-page-muted" title={n.id}>
            {data.reference ? '↗ 引用' : n.kind.toUpperCase()} / {n.id}
          </span>
          {steps.length > 0 && (
            <span className={`ws-status shrink-0 ${state}`}>
              <span />
              {steps.length} 步
            </span>
          )}
        </span>
        {!data.reference && (
          <>
            <span
              className="mt-2 line-clamp-3 text-left text-sm leading-6"
              title={n.kind === 'branch' ? n.condition : n.goal}
            >
              {n.kind === 'branch' ? n.condition : n.goal}
            </span>
            {n.dependsOn.length > 0 && (
              <span
                className="mt-2 block truncate text-left text-xs text-page-muted"
                title={n.dependsOn.join(' · ')}
              >
                依赖：{n.dependsOn.join(' · ')}
              </span>
            )}
            {n.kind === 'task' && (
              <span className="mt-2 block truncate text-left text-xs text-page-muted">
                {n.assertions.length} 个预期
                {n.requirementIds.length ? ` · ${n.requirementIds.join(', ')}` : ''}
              </span>
            )}
            {n.kind === 'branch' && !n.otherwise && (
              <span className="mt-2 block text-left text-xs text-page-muted">
                NO / 条件不成立：跳过
              </span>
            )}
          </>
        )}
      </Button>
    </div>
  );
});
