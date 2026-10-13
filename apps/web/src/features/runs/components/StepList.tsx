'use client';

import clsx from 'clsx';

import styles from './StepList.module.css';
import studioStyles from '@/features/runs/components/run-studio.module.css';

import { Icon } from '@iconify/react/offline';

import { Button } from '@/components/ui/Button';
import { actionIcon } from '@/features/runs/lib/actionIcon';
import { statuses } from '@/features/runs/presentation';
import { memo, useId, useState, type ReactNode } from 'react';
import type { ExecutionStep } from '@testdog/contracts/runs/types';

const kinds = { action: '操作', navigate: '导航', wait: '等待', assertion: '断言', branch: '分支' };

/** Keep frame playback from rendering the entire step history. */
export const StepList = memo(function StepList({
  steps,
  selectedId,
  running,
  onSelect,
  renderDetails,
  renderIssue,
}: {
  steps: ExecutionStep[];
  selectedId?: string;
  running: boolean;
  onSelect: (step: ExecutionStep) => void;
  renderDetails: (step: ExecutionStep) => ReactNode;
  renderIssue?: (step: ExecutionStep) => ReactNode;
}) {
  const detailsId = useId();
  const [collapsedId, setCollapsedId] = useState<string>();

  return (
    <section aria-label="执行步骤" className={styles.section}>
      <div className={styles.container}>
        <h2 className={styles.heading}>执行步骤</h2>
        <span className={styles.label}>
          {steps.filter((step) => step.status === 'passed').length || 0} / {steps.length || 0}
        </span>
      </div>
      <div className={styles.section}>
        <ol>
          {steps.map((step) => (
            <li key={step.id}>
              <Button
                variant="ghost"
                aria-expanded={selectedId === step.id && collapsedId !== step.id}
                aria-controls={`${detailsId}-${step.id}`}
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
                <span aria-hidden="true" className={styles.expandIndicator}>
                  {selectedId === step.id && collapsedId !== step.id ? '⌃' : '⌄'}
                </span>
              </Button>
              {renderIssue?.(step)}
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
            </li>
          ))}
        </ol>
        {!steps.length && (
          <p className={styles.description}>
            {running ? '正在生成测试计划，步骤将在执行时逐一出现。' : '没有已执行的浏览器步骤。'}
          </p>
        )}
      </div>
    </section>
  );
});
