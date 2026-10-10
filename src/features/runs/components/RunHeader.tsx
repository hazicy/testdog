import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { WorkspaceIcon as Icon } from '@/components/shared/WorkspaceIcon';
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
    <>
      <Link
        href="/runs"
        className="mb-6 inline-flex items-center gap-2 text-xs text-page-muted hover:text-brand"
      >
        ← 返回执行记录
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-3 font-mono text-xs text-page-muted">执行记录 / {id.slice(0, 8)}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {run?.name || '加载执行记录…'}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-page-muted">
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
                  <Icon name="results" width="14" /> 重放操作
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
            <Icon name="download" />
          </Button>
        </div>
      </div>
    </>
  );
}
