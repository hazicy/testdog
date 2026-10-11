import { statusStyles } from '@/components/ui/statusStyles';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { Icon } from '@iconify/react/offline';
import downloadIcon from '@iconify-icons/lucide/download';
import resultsIcon from '@iconify-icons/lucide/play';
import backIcon from '@iconify-icons/lucide/chevron-left';
import { isActiveRun, type TestRun } from '@/features/runs/types';
import { statuses, time } from '../presentation';

type Props = {
  id: string;
  run?: TestRun;
  now: number;
  busy: boolean;
  exporting: boolean;
  start: (mode: 'record' | 'replay') => Promise<void>;
  cancel: () => Promise<void>;
  exportReport: () => Promise<void>;
};

export function RunHeader({ id, run, now, busy, exporting, start, cancel, exportReport }: Props) {
  return (
    <header className="run-studio-toolbar flex min-h-14 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 bg-page px-3 py-2 sm:px-5">
      <Link
        href="/runs"
        className={buttonStyles({ variant: 'ghost', size: 'icon-sm' })}
        aria-label="返回执行记录"
        title="返回执行记录"
      >
        <Icon icon={backIcon} width="16" aria-hidden="true" />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <p className="sr-only">执行记录 / {id.slice(0, 8)}</p>
        <h1 className="min-w-0 truncate text-[13px] leading-5 font-medium" title={run?.name}>
          {run?.name || '加载执行记录…'}
        </h1>
        <div className="flex shrink-0 items-center gap-3 text-xs whitespace-nowrap text-page-muted">
          {run && (
            <>
              <span
                data-slot="status"
                data-status={run.status}
                className={statusStyles(run.status)}
              >
                <span />
                {statuses[run.status]}
              </span>
              <span className="font-mono">{run.mode === 'replay' ? '重放' : '录制'}</span>
              <span>{run.steps.length} 个步骤</span>
              <span>{time(run.durationMs ?? Math.max(0, now - Date.parse(run.startedAt)))}</span>
              {run.sourceRunId && (
                <Link className="underline underline-offset-4" href={`/runs/${run.sourceRunId}`}>
                  查看原记录 ↗
                </Link>
              )}
            </>
          )}
        </div>
      </div>
      <div className="ml-auto flex w-full shrink-0 flex-wrap items-center justify-end gap-1.5 sm:w-auto">
        {run && isActiveRun(run.status) ? (
          <Button size="sm" disabled={busy || run.cancelRequested} onClick={() => void cancel()}>
            {run.cancelRequested ? '正在停止…' : '停止执行'}
          </Button>
        ) : (
          run && (
            <>
              <Button
                disabled={busy || !run.replayable}
                title={
                  run.replayable
                    ? '按记录的动作顺序重新执行，重新验证断言'
                    : '需要成功执行且每个操作都有稳定定位器'
                }
                variant="outline"
                size="sm"
                onClick={() => void start('replay')}
              >
                <Icon icon={resultsIcon} width="14" aria-hidden="true" /> 重放操作
              </Button>
              {run.testId && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void start('record')}
                >
                  重新录制
                </Button>
              )}
            </>
          )
        )}
        <Button
          disabled={!run || exporting}
          variant="ghost"
          size="icon-sm"
          aria-label="导出执行报告"
          title="导出执行报告"
          onClick={() => void exportReport()}
        >
          <Icon icon={downloadIcon} width="16" aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}
