import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Icon } from '@iconify/react/offline';
import downloadIcon from '@iconify-icons/lucide/download';
import resultsIcon from '@iconify-icons/lucide/play';
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
    <header className="run-studio-toolbar">
      <Link
        href="/runs"
        className="studio-back inline-flex items-center gap-2 text-sm font-medium text-page-muted hover:text-brand"
      >
        ← 返回执行记录
      </Link>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="sr-only">执行记录 / {id.slice(0, 8)}</p>
          <h1 className="truncate text-sm font-semibold">{run?.name || '加载执行记录…'}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-page-muted">
            {run && (
              <>
                <span className={`ws-status ${run.status}`}>
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
        <div className="flex flex-wrap gap-2">
          {run && isActiveRun(run.status) ? (
            <Button
              disabled={busy || run.cancelRequested}
              onClick={() => void cancel()}
              className="ws-button"
            >
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
                  className="ws-button primary"
                  onClick={() => void start('replay')}
                >
                  <Icon icon={resultsIcon} width="14" aria-hidden="true" /> 重放操作
                </Button>
                {run.testId && (
                  <Button
                    disabled={busy}
                    className="ws-button"
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
            className="ws-icon-button"
            aria-label="导出执行报告"
            title="导出执行报告"
            onClick={() => void exportReport()}
          >
            <Icon icon={downloadIcon} width="18" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </header>
  );
}
