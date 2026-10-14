'use client';

import clsx from 'clsx';
import { Icon } from '@iconify/react/offline';
import chevronIcon from '@iconify-icons/lucide/chevron-right';
import { memo, useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { actionIcon } from '@/features/runs/lib/actionIcon';
import { statuses } from '@/features/runs/presentation';
import type { ExecutionStep } from '@testdog/contracts/runs/types';
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
      {steps.map((step) => {
        const selected = selectedId === step.id;
        const expanded = !!renderDetails && selected && collapsedId !== step.id;
        const contentId = `${detailsId}-${step.id}`;

        return (
          <li key={step.id}>
            <Button
              variant="ghost"
              aria-expanded={renderDetails ? expanded : undefined}
              aria-controls={renderDetails ? contentId : undefined}
              onClick={() => {
                if (renderDetails) setCollapsedId(expanded ? step.id : undefined);
                onSelect(step);
              }}
              className={clsx(styles.action, { [styles.selected]: selected })}
            >
              <span
                title={statuses[step.status]}
                aria-label={statuses[step.status]}
                className={styles.sequence}
                data-status={step.status}
              >
                <Icon icon={actionIcon(step)} aria-hidden="true" width="12" height="12" />
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
                <Icon
                  icon={chevronIcon}
                  width="12"
                  aria-hidden="true"
                  className={styles.expandIndicator}
                  data-expanded={expanded || undefined}
                />
              )}
            </Button>
            {renderIssue?.(step)}
            {renderDetails && (
              <div id={contentId} hidden={!expanded} className={styles.details}>
                {expanded && renderDetails(step)}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
});
