'use client';

import clsx from 'clsx';
import { Icon } from '@iconify/react/offline';
import { memo, useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { actionIcon } from '@/features/runs/lib/actionIcon';
import { statuses } from '@/features/runs/presentation';
import type { ExecutionStep } from '@testdog/contracts/runs/types';
import studioStyles from './run-studio.module.css';
import styles from './ExecutionActions.module.css';

const kinds = { action: '操作', navigate: '导航', wait: '等待', assertion: '断言', branch: '分支' };

export type ExecutionActionsProps = {
  steps: ExecutionStep[];
  selectedId?: string;
  onSelect: (step: ExecutionStep) => void;
  renderDetails?: (step: ExecutionStep) => ReactNode;
  renderIssue?: (step: ExecutionStep) => ReactNode;
};

export const ExecutionActions = memo(function ExecutionActions({
  steps,
  selectedId,
  onSelect,
  renderDetails,
  renderIssue,
}: ExecutionActionsProps) {
  const detailsId = useId();
  const [collapsedId, setCollapsedId] = useState<string>();

  return (
    <ol>
      {steps.map((step) => (
        <li key={step.id}>
          <Button
            variant="ghost"
            aria-expanded={
              renderDetails ? selectedId === step.id && collapsedId !== step.id : undefined
            }
            aria-controls={renderDetails ? `${detailsId}-${step.id}` : undefined}
            onClick={() => {
              setCollapsedId(
                selectedId === step.id && collapsedId !== step.id ? step.id : undefined,
              );
              onSelect(step);
            }}
            className={clsx(styles.action, { [styles.selected]: selectedId === step.id })}
          >
            <span
              title={statuses[step.status]}
              aria-label={statuses[step.status]}
              className={clsx(
                styles.sequence,
                step.status === 'failed'
                  ? styles.failed
                  : step.status === 'passed'
                    ? styles.passed
                    : styles.pending,
              )}
            >
              <Icon icon={actionIcon(step)} aria-hidden="true" width="14" height="14" />
            </span>
            <span className={styles.content}>
              <span className={styles.title}>{step.title}</span>
              <span className={styles.metadata}>
                {kinds[step.kind]} · {step.pageId} ·{' '}
                {step.durationMs == null
                  ? step.status === 'running'
                    ? '执行中'
                    : '已中断'
                  : `${(step.durationMs / 1000).toFixed(1)}s`}
              </span>
            </span>
            {renderDetails && (
              <span aria-hidden="true" className={styles.expandIndicator}>
                {selectedId === step.id && collapsedId !== step.id ? '⌃' : '⌄'}
              </span>
            )}
          </Button>
          {renderIssue?.(step)}
          {renderDetails && (
            <div
              id={`${detailsId}-${step.id}`}
              hidden={selectedId !== step.id || collapsedId === step.id}
            >
              {selectedId === step.id && collapsedId !== step.id && (
                <div className={clsx(studioStyles.studioContent, styles.details)}>
                  {renderDetails(step)}
                </div>
              )}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
});
