'use client';

import clsx from 'clsx';

import boardStyles from '@/features/runs/components/plan-board.module.css';
import styles from './PlanNodes.module.css';

import { statusStyles } from '@/components/ui/statusStyles';
import { Button } from '@/components/ui/Button';
import Image from 'next/image';
import { asset, statuses } from '@/features/runs/presentation';
import { type boardResult, planNodeTitle, stepResult } from '@/features/runs/lib/boardResults';
import { memo, useId, useState } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { PlanNode } from '@testdog/contracts/automation/compiler/schema';
import type { ExecutionStep, RunArtifact } from '@testdog/contracts/runs/types';
import { ExecutionActions } from './ExecutionActions';
import { StepBadge } from '@/features/test-cases/components/StepType';

export const nodeDragType = 'application/x-testdog-node';
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
    result?: ReturnType<typeof boardResult>;
    current?: boolean;
    currentStepId?: string;
    onFrame?: (frame: RunArtifact) => void;
    onIssue?: (step: ExecutionStep) => void;
  },
  'plan'
>;

export const PlanNodes = memo(function PlanNodes({ data }: NodeProps<PlanFlowNode>) {
  const { node, steps } = data;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const actionsId = useId();
  const type =
    data.assertionIndex !== undefined
      ? 'assert'
      : node.kind === 'task'
        ? (node.actionType ?? 'act')
        : node.kind;
  const content = planNodeTitle(node, data.assertionIndex);
  const status = (data.result ?? stepResult(steps)).status;
  const beforeContent = data.review?.before
    ? planNodeTitle(data.review.before, data.assertionIndex)
    : '';

  function finish() {
    if (draft.trim() && draft !== content) data.onContent(draft.trim());
    setEditing(false);
  }

  return (
    <div
      data-plan-node={node.id}
      data-reference={data.reference || undefined}
      data-editing={editing || undefined}
      data-step-type={type}
      data-review={data.review?.kind}
      data-current={data.current || undefined}
      data-result={data.result?.status}
      className={boardStyles.planNode}
      onDragOver={(event) => {
        if (data.editable && data.mutable && event.dataTransfer.types.includes(nodeDragType)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(event) => {
        const id = event.dataTransfer.getData(nodeDragType);

        if (id && data.editable && data.mutable) {
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
        <div className={clsx(boardStyles.planReviewActions, 'nodrag', 'nopan')}>
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
        <div className={clsx(boardStyles.planNodeActions, 'nodrag', 'nopan')}>
          <button
            type="button"
            draggable
            aria-label={`拖拽节点 ${node.id}`}
            title="拖拽调整顺序"
            className={boardStyles.planDragHandle}
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
      <div className={clsx(boardStyles.planNodeRow, 'nodrag')}>
        <StepBadge type={type} />
        <div className={boardStyles.planNodeContent}>
          {data.review?.kind === 'modified' && data.review.before && (
            <span className={boardStyles.planReviewBefore}>{beforeContent}</span>
          )}
          {data.pathLabel && <span className={boardStyles.planPathLabel}>{data.pathLabel}</span>}
          {editing ? (
            <textarea
              autoFocus
              className={clsx(boardStyles.planInlineInput, 'nodrag', 'nopan')}
              aria-label={`节点内容 ${node.id}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={finish}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Escape') setEditing(false);
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  finish();
                }
              }}
            />
          ) : (
            <button
              data-ui="plan-content-button"
              type="button"
              className={boardStyles.planContentButton}
              aria-label={
                data.editable
                  ? `编辑节点 ${node.id}`
                  : data.reference
                    ? `查看引用节点 ${node.id}`
                    : data.assertionIndex !== undefined
                      ? `查看断言 ${node.id} ${data.assertionIndex + 1}`
                      : `查看节点 ${node.id}`
              }
              aria-expanded={data.editable ? undefined : expanded}
              aria-controls={data.editable ? undefined : actionsId}
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
            <span className={boardStyles.planPathLabel}>NO / 条件不成立：跳过</span>
          )}
        </div>
        {!!steps.length && (
          <span data-slot="status" data-status={status} className={statusStyles(status)}>
            <span />
            {data.result
              ? status === 'passed' && type !== 'assert'
                ? '步骤已通过'
                : statuses[status as keyof typeof statuses]
              : `${steps.length} 步`}
          </span>
        )}
      </div>
      {data.result && (
        <div className={clsx(boardStyles.planResult, 'nodrag', 'nopan')}>
          <div className={boardStyles.planResultSummary}>
            {data.current && <span className={boardStyles.planPlaybackMarker}>当前回放位置</span>}
            {data.result.durationMs !== undefined && (
              <span>
                {(data.result.durationMs / 1000).toFixed(1)}s · {steps.length} 步
              </span>
            )}
            {type === 'assert' && <p>预期：{content}</p>}
            {data.result.primary?.evidence && <p>验证证据：{data.result.primary.evidence}</p>}
            {data.result.primary?.error && (
              <p className={boardStyles.planResultError}>{data.result.primary.error}</p>
            )}
            {node.kind === 'branch' && data.result.primary?.decision !== undefined && (
              <p>判断结果：{data.result.primary.decision ? 'YES / 条件成立' : 'NO / 条件不成立'}</p>
            )}
            {!steps.length && <p>尚无执行结果</p>}
            {steps.length > 0 && !data.result.frame && <p>暂无已归档截图</p>}
            {data.result.primary && (
              <Button
                type="button"
                aria-expanded={expanded}
                aria-controls={actionsId}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? '收起动作' : '展开动作'}
              </Button>
            )}
            {data.result.primary && data.onIssue && (
              <Button
                type="button"
                className={styles.action}
                onClick={() => data.onIssue?.(data.result!.primary!)}
              >
                创建或关联问题
              </Button>
            )}
          </div>
          {data.result.frame && (
            <button
              type="button"
              className={boardStyles.planResultThumbnail}
              aria-label={`查看截图：${content}`}
              onClick={() => data.onFrame?.(data.result!.frame!)}
            >
              <Image
                src={asset(data.result.frame.runId, data.result.frame)}
                alt={`证据截图：${content}`}
                width={240}
                height={140}
                unoptimized
              />
              <span>
                {data.result.frame.stage === 'before' ? '执行前截图' : '执行截图'} · 点击回看
              </span>
            </button>
          )}
        </div>
      )}
      {!data.editable && expanded && (
        <div
          id={actionsId}
          data-ui="plan-inline-evidence"
          className={clsx(boardStyles.planInlineEvidence, 'nodrag', 'nopan')}
        >
          <ExecutionActions steps={steps} selectedId={data.currentStepId} onSelect={data.onStep} />
          {!steps.length && <p>暂无执行动作</p>}
        </div>
      )}
    </div>
  );
});
