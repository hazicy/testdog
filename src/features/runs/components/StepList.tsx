'use client';

import { Icon } from '@iconify/react/offline';

import { Button } from '@/components/ui/Button';

import { actionIcon } from '../lib/actionIcon';
import { statuses } from '../presentation';
import { memo, useId, useState, type ReactNode } from 'react';
import type { ExecutionStep } from '@/features/runs/types';

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
    <section aria-label="执行步骤" className="min-w-0">
      <div className="flex h-12 items-center justify-between border-b border-page-line px-5">
        <h2 className="text-xs font-medium">执行步骤</h2>
        <span className="font-mono text-xs text-page-muted">
          {steps.filter((step) => step.status === 'passed').length || 0} / {steps.length || 0}
        </span>
      </div>
      <div className="min-w-0">
        <ol>
          {steps.map((step) => (
            <li key={step.id}>
              <Button
                aria-expanded={selectedId === step.id && collapsedId !== step.id}
                aria-controls={`${detailsId}-${step.id}`}
                onClick={() => {
                  setCollapsedId(
                    selectedId === step.id && collapsedId !== step.id ? step.id : undefined,
                  );
                  onSelect(step);
                }}
                className={`flex w-full items-start gap-3 border-b border-page-line px-5 py-4 text-left transition-colors hover:bg-step-hover ${selectedId === step.id ? 'bg-step-selected' : ''}`}
              >
                <span
                  title={statuses[step.status]}
                  aria-label={statuses[step.status]}
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center border font-mono text-xs ${step.status === 'failed' ? 'border-error-line text-error' : step.status === 'passed' ? 'border-step-success-line text-step-success' : 'border-brand text-brand'}`}
                >
                  <Icon icon={actionIcon(step)} aria-hidden="true" width="14" height="14" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-xs leading-5 text-ink">{step.title}</span>
                  <span className="mt-1.5 block font-mono text-xs text-page-muted">
                    {kinds[step.kind]} · {step.pageId} ·{' '}
                    {step.durationMs == null
                      ? step.status === 'running'
                        ? '执行中'
                        : '已中断'
                      : `${(step.durationMs / 1000).toFixed(1)}s`}
                  </span>
                </span>
                <span aria-hidden="true" className="self-center text-page-muted">
                  {selectedId === step.id && collapsedId !== step.id ? '⌃' : '⌄'}
                </span>
              </Button>
              {renderIssue?.(step)}
              <div
                id={`${detailsId}-${step.id}`}
                hidden={selectedId !== step.id || collapsedId === step.id}
              >
                {selectedId === step.id && collapsedId !== step.id && (
                  <div className="studio-content border-b border-page-line">
                    {renderDetails(step)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
        {!steps.length && (
          <p className="p-6 text-xs leading-6 text-page-muted">
            {running ? '正在生成测试计划，步骤将在执行时逐一出现。' : '没有已执行的浏览器步骤。'}
          </p>
        )}
      </div>
    </section>
  );
});
