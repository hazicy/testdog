import { statusStyles } from '@/components/ui/statusStyles';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { Icon } from '@iconify/react/offline';
import downloadIcon from '@iconify-icons/lucide/download';
import resultsIcon from '@iconify-icons/lucide/play';
import backIcon from '@iconify-icons/lucide/chevron-left';
import stopIcon from '@iconify-icons/lucide/square';
import recordIcon from '@iconify-icons/lucide/rotate-cw';
import { RunLayoutPopover, type RunLayout } from './RunLayoutPopover';
import { isActiveRun, type TestRun } from '@/features/runs/types';
import { statuses } from '../presentation';

type Props = {
  id: string;
  embedded?: boolean;
  run?: TestRun;
  layout: RunLayout;
  changeLayout: (layout: RunLayout) => void;
  busy: boolean;
  exporting: boolean;
  start: (mode: 'record' | 'replay') => Promise<void>;
  cancel: () => Promise<void>;
  exportReport: () => Promise<void>;
};

export function RunHeader({
  id,
  embedded = false,
  run,
  layout,
  changeLayout,
  busy,
  exporting,
  start,
  cancel,
  exportReport,
}: Props) {
  return (
    <header className="run-studio-toolbar grid min-h-14 shrink-0 grid-cols-1 items-center gap-x-4 gap-y-2 bg-page px-3 py-2 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <div className="flex min-w-0 items-center gap-3">
        {!embedded && (
          <Link
            href="/runs"
            className={buttonStyles({ variant: 'ghost', size: 'icon-sm' })}
            aria-label="返回执行记录"
            title="返回执行记录"
          >
            <Icon icon={backIcon} width="16" aria-hidden="true" />
          </Link>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <p className="sr-only">执行记录 / {id.slice(0, 8)}</p>
          <h1 className="min-w-0 truncate text-[13px] leading-5 font-medium" title={run?.name}>
            {run?.name || '加载执行记录…'}
          </h1>
          {run && (
            <span
              data-slot="status"
              data-status={run.status}
              className={`${statusStyles(run.status)} shrink-0`}
            >
              <span />
              {statuses[run.status]}
            </span>
          )}
        </div>
      </div>
      <div
        className="inline-flex w-fit items-center justify-self-center gap-0.5 overflow-hidden rounded-lg bg-control-hover p-0.5 [&>button]:rounded-none [&>button:first-child]:rounded-l [&>button:last-child]:rounded-r [&>button]:border-0 [&>button]:focus-visible:-outline-offset-2"
        role="group"
        aria-label="执行操作"
      >
        {run && isActiveRun(run.status) ? (
          <Button
            variant="soft"
            size="sm"
            className="gap-0.5 px-2"
            disabled={busy || run.cancelRequested}
            aria-label={run.cancelRequested ? '正在停止…' : '停止执行'}
            title={run.cancelRequested ? '正在停止…' : '停止执行'}
            onClick={() => void cancel()}
          >
            <Icon icon={stopIcon} width="16" aria-hidden="true" />
            {run.cancelRequested ? '正在停止…' : '停止'}
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
                variant="soft"
                size="sm"
                className="gap-0.5 px-2"
                aria-label="重放操作"
                onClick={() => void start('replay')}
              >
                <Icon icon={resultsIcon} width="16" aria-hidden="true" />
                重放
              </Button>
              {run.testId && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="h-8"
                  aria-label="重新录制"
                  title="重新录制"
                  disabled={busy}
                  onClick={() => void start('record')}
                >
                  <Icon icon={recordIcon} width="16" aria-hidden="true" />
                </Button>
              )}
            </>
          )
        )}
        <Button
          disabled={!run || exporting}
          variant="ghost"
          size="icon-xs"
          className="h-8"
          aria-label="导出执行报告"
          title="导出执行报告"
          onClick={() => void exportReport()}
        >
          <Icon icon={downloadIcon} width="16" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex shrink-0 items-center justify-self-end">
        <RunLayoutPopover value={layout} onChange={changeLayout} />
      </div>
    </header>
  );
}
