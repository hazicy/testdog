'use client';

import { Icon } from '@iconify/react/offline';
import gripIcon from '@iconify-icons/lucide/grip-vertical';
import checkIcon from '@iconify-icons/lucide/check';
import closeIcon from '@iconify-icons/lucide/x';

import { useTranslations } from 'next-intl';

import clsx from 'clsx';

import boardStyles from '@/features/runs/components/plan-board.module.css';

import { statusStyles } from '@/components/ui/statusStyles';
import { type boardResult, planNodeTitle, stepResult } from '@/features/runs/lib/boardResults';
import { ExecutionPluginEditor } from '@/features/plugins/ExecutionPluginEditor';
import type { PluginInvocation } from '@testdog/contracts/plugins/execution';
import { memo, useEffect, useId, useState } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { PlanNode } from '@testdog/contracts/automation/compiler/schema';
import type { ExecutionStep, RunArtifact } from '@testdog/contracts/runs/types';
import { ExecutionActions } from './ExecutionActions';
import { PlanNodeResult } from './PlanNodeResult';
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
    autoEdit?: boolean;
    onAutoEdit?: () => void;
    assertionIndex?: number;
    pathLabel?: string;
    steps: ExecutionStep[];
    editable: boolean;
    mutable: boolean;
    onContent: (value: string) => void;
    onPlugin?: (plugin: PluginInvocation, title: string) => boolean;
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

function PlanReviewActions({ review, nodeId }: { review: NodeReview; nodeId: string }) {
  const t = useTranslations('runs');

  return (
    <div className={clsx(boardStyles.planReviewActions, 'nodrag', 'nopan')}>
      <span>
        {review.kind === 'added'
          ? t('added')
          : review.kind === 'removed'
            ? t('delete')
            : t('modified')}
        {review.count > 1 ? ` · ${t('relatedChanges', { count: review.count })}` : ''}
      </span>
      <button
        type="button"
        aria-label={t('acceptChange', { id: nodeId })}
        title={t('accept')}
        onClick={review.onAccept}
      >
        <Icon icon={checkIcon} width="14" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={t('rejectChange', { id: nodeId })}
        title={t('reject')}
        onClick={review.onReject}
      >
        <Icon icon={closeIcon} width="14" aria-hidden="true" />
      </button>
    </div>
  );
}

export const PlanNodes = memo(function PlanNodes({ data }: NodeProps<PlanFlowNode>) {
  const t = useTranslations('runs');
  const statusText = useTranslations('workspace');
  const { node, steps, autoEdit, onAutoEdit } = data;

  const [expanded, setExpanded] = useState(false);
  const actionsId = useId();
  const type =
    data.assertionIndex !== undefined
      ? 'assert'
      : node.kind === 'task'
        ? (node.actionType ?? 'act')
        : node.kind;
  const content = planNodeTitle(node, data.assertionIndex);
  const [editing, setEditing] = useState(!!autoEdit);
  const [draft, setDraft] = useState(content);

  useEffect(() => {
    if (autoEdit) onAutoEdit?.();
  }, [autoEdit, onAutoEdit]);
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
      {data.review && <PlanReviewActions review={data.review} nodeId={node.id} />}
      {data.editable && data.mutable && (
        <div className={clsx(boardStyles.planNodeActions, 'nodrag', 'nopan')}>
          <button
            type="button"
            draggable
            aria-label={t('dragNode', { id: node.id })}
            title={t('dragHint')}
            className={boardStyles.planDragHandle}
            onDragStart={(event) => {
              event.dataTransfer.setData(nodeDragType, node.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
          >
            <Icon icon={gripIcon} width="14" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t('copyNode', { id: node.id })}
            title={t('copy')}
            onClick={data.onDuplicate}
          >
            {t('copy')}
          </button>
          <button
            type="button"
            aria-label={t('deleteNode', { id: node.id })}
            title={t('delete')}
            onClick={data.onRemove}
          >
            {t('delete')}
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
          {editing && node.kind === 'task' && node.actionType === 'plugin' ? (
            <>
              <span>{content}</span>
              <ExecutionPluginEditor
                invocation={node.plugin}
                onDismiss={() => setEditing(false)}
                onSave={(plugin, title) => {
                  if (data.onPlugin?.(plugin, title)) setEditing(false);
                }}
              />
            </>
          ) : editing ? (
            <textarea
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              className={clsx(boardStyles.planInlineInput, 'nodrag', 'nopan')}
              aria-label={t('nodeContent', { id: node.id })}
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
                  ? t('editNode', { id: node.id })
                  : data.reference
                    ? t('viewReference', { id: node.id })
                    : data.assertionIndex !== undefined
                      ? t('viewAssertion', { id: node.id, index: data.assertionIndex + 1 })
                      : t('viewNode', { id: node.id })
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
            <span className={boardStyles.planPathLabel}>{t('skipFalse')}</span>
          )}
        </div>
        {!!steps.length && (
          <span data-slot="status" data-status={status} className={statusStyles(status)}>
            <span />
            {data.result
              ? status === 'passed' && type !== 'assert'
                ? t('stepPassed')
                : statusText(status as 'running' | 'passed' | 'failed')
              : t('stepCount', { count: steps.length })}
          </span>
        )}
      </div>
      {data.result && (
        <PlanNodeResult
          data={data}
          result={data.result}
          content={content}
          assertion={type === 'assert'}
          expanded={expanded}
          actionsId={actionsId}
          onToggle={() => setExpanded(!expanded)}
        />
      )}
      {!data.editable && expanded && (
        <div
          id={actionsId}
          data-ui="plan-inline-evidence"
          className={clsx(boardStyles.planInlineEvidence, 'nodrag', 'nopan')}
        >
          <ExecutionActions steps={steps} selectedId={data.currentStepId} onSelect={data.onStep} />
          {!steps.length && <p>{t('noActions')}</p>}
        </div>
      )}
    </div>
  );
});
