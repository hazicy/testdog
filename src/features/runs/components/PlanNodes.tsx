'use client';

import { memo, useState } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { PlanNode } from '@/automation/compiler/schema';
import type { ExecutionStep } from '@/features/runs/types';
import { StepBadge } from '@/features/test-cases/components/StepType';

export const nodeDragType = 'application/x-caseforge-node';
export type NodeReview = {
  kind: 'added' | 'modified' | 'removed';
  before?: PlanNode;
  count: number;
  onAccept: () => void;
  onReject: () => void;
};
export type PlanFlowNode = Node<
  {
    node: PlanNode;
    reference: boolean;
    assertionIndex?: number;
    pathLabel?: string;
    steps: ExecutionStep[];
    editable: boolean;
    mutable: boolean;
    onContent: (value: string) => void;
    onDuplicate: () => void;
    onRemove: () => void;
    onDrop: (id: string) => void;
    onStep: (step: ExecutionStep) => void;
    review?: NodeReview;
  },
  'plan'
>;

export const PlanNodes = memo(function PlanNodes({ data }: NodeProps<PlanFlowNode>) {
  const { node, steps } = data;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const type =
    data.assertionIndex !== undefined
      ? 'assert'
      : node.kind === 'task'
        ? (node.actionType ?? 'act')
        : node.kind;
  const content =
    data.assertionIndex !== undefined && node.kind === 'task'
      ? (node.assertions[data.assertionIndex]?.description ?? '')
      : node.kind === 'branch'
        ? node.condition
        : node.goal;
  const status = steps.some((step) => step.status === 'failed')
    ? 'failed'
    : steps.some((step) => step.status === 'running')
      ? 'running'
      : steps.length
        ? 'passed'
        : 'none';

  function finish() {
    if (draft.trim() && draft !== content) data.onContent(draft.trim());
    setEditing(false);
  }

  return (
    <div
      data-plan-node={node.id}
      data-step-type={type}
      data-review={data.review?.kind}
      className={`plan-node ${type} ${data.reference ? 'reference' : ''} ${editing ? 'active' : ''}`}
      onDragOver={(event) => {
        if (data.editable && event.dataTransfer.types.includes(nodeDragType)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(event) => {
        const id = event.dataTransfer.getData(nodeDragType);

        if (id && data.editable) {
          event.preventDefault();
          data.onDrop(id);
        }
      }}
    >
      <Handle id="sequence-in" type="target" position={Position.Top} isConnectable={false} />
      <Handle id="sequence-out" type="source" position={Position.Bottom} isConnectable={false} />
      <Handle id="node-in" type="target" position={Position.Left} isConnectable={false} />
      <Handle id="node-out" type="source" position={Position.Right} isConnectable={false} />
      {data.review && (
        <div className="plan-review-actions nodrag nopan">
          <span>
            {data.review.kind === 'added'
              ? '新增'
              : data.review.kind === 'removed'
                ? '删除'
                : '修改'}
            {data.review.count > 1 ? ` · ${data.review.count} 项关联变更` : ''}
          </span>
          <button
            type="button"
            aria-label={`接受变更 ${node.id}`}
            title="接受"
            onClick={data.review.onAccept}
          >
            ✓
          </button>
          <button
            type="button"
            aria-label={`拒绝变更 ${node.id}`}
            title="拒绝"
            onClick={data.review.onReject}
          >
            ×
          </button>
        </div>
      )}
      {data.editable && data.mutable && (
        <div className="plan-node-actions nodrag nopan">
          <button
            type="button"
            draggable
            aria-label={`拖拽节点 ${node.id}`}
            title="拖拽调整顺序"
            className="plan-drag-handle"
            onDragStart={(event) => {
              event.dataTransfer.setData(nodeDragType, node.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
          >
            ⠿
          </button>
          <button
            type="button"
            aria-label={`复制节点 ${node.id}`}
            title="复制"
            onClick={data.onDuplicate}
          >
            复制
          </button>
          <button
            type="button"
            aria-label={`删除节点 ${node.id}`}
            title="删除"
            onClick={data.onRemove}
          >
            删除
          </button>
        </div>
      )}
      <div className="plan-node-row nodrag nopan">
        <StepBadge type={type} />
        <div className="plan-node-content">
          {data.review?.kind === 'modified' && data.review.before && (
            <span className="plan-review-before">
              {data.review.before.kind === 'branch'
                ? data.review.before.condition
                : data.review.before.goal}
            </span>
          )}
          {data.pathLabel && <span className="plan-path-label">{data.pathLabel}</span>}
          {editing ? (
            <textarea
              autoFocus
              className="plan-inline-input nodrag nopan"
              aria-label={`节点内容 ${node.id}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={finish}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Escape') setEditing(false);
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  finish();
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="plan-content-button"
              aria-label={
                data.editable
                  ? `编辑节点 ${node.id}`
                  : data.reference
                    ? `查看引用节点 ${node.id}`
                    : data.assertionIndex !== undefined
                      ? `查看断言 ${node.id} ${data.assertionIndex + 1}`
                      : `查看节点 ${node.id}`
              }
              onClick={() => {
                if (data.editable) {
                  setDraft(content);
                  setEditing(true);
                } else setExpanded(!expanded);
              }}
            >
              {data.reference ? `↗ ${content}` : content}
            </button>
          )}
          {node.kind === 'branch' && !node.otherwise && (
            <span className="plan-path-label">NO / 条件不成立：跳过</span>
          )}
        </div>
        {!!steps.length && (
          <span className={`ws-status ${status}`}>
            <span />
            {steps.length} 步
          </span>
        )}
      </div>
      {!data.editable && expanded && (
        <div className="plan-inline-evidence nodrag nopan">
          {steps.map((step) => (
            <button
              type="button"
              key={step.id}
              onClick={() => data.onStep(step)}
              className="ws-button"
            >
              #{step.sequence} {step.title}
            </button>
          ))}
          {!steps.length && <p>尚无关联步骤。分组的步骤位于子节点。</p>}
        </div>
      )}
    </div>
  );
});
