'use client';

import { memo } from 'react';
import type { ExecutionStep } from '@/workspace/types';

const kinds = { action: '操作', navigate: '导航', wait: '等待', assertion: '断言', branch: '分支' };

/** Keep frame playback from rendering the entire step history. */
export const StepList = memo(function StepList({
  steps,
  selectedId,
  running,
  onSelect,
}: {
  steps: ExecutionStep[];
  selectedId?: string;
  running: boolean;
  onSelect: (step: ExecutionStep) => void;
}) {
  return (
    <section aria-label="执行步骤" className="border-t border-page-line xl:border-t-0">
      <div className="flex h-12 items-center justify-between border-b border-page-line px-5">
        <h2 className="text-xs font-medium">执行步骤</h2>
        <span className="font-mono text-xs text-page-muted">
          {steps.filter((step) => step.status === 'passed').length || 0} / {steps.length || 0}
        </span>
      </div>
      <div className="max-h-[620px] overflow-y-auto">
        <ol>
          {steps.map((step) => (
            <li key={step.id}>
              <button
                onClick={() => onSelect(step)}
                className={`flex w-full items-start gap-3 border-b border-page-line px-5 py-4 text-left transition-colors hover:bg-[#f2f1e9] ${selectedId === step.id ? 'bg-[#f3eee4]' : ''}`}
              >
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center border font-mono text-xs ${step.status === 'failed' ? 'border-red-200 text-red-600' : step.status === 'passed' ? 'border-[#cdd5bf] text-[#6c805b]' : 'border-brand text-brand'}`}
                >
                  {step.status === 'passed'
                    ? '✓'
                    : step.status === 'failed'
                      ? '×'
                      : step.sequence.toString().padStart(2, '0')}
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
              </button>
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
