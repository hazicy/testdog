import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { WorkspaceIcon as Icon } from '@/components/shared/WorkspaceIcon';
import type { TestCase, RunSummary } from '@/workspace/types';

const statusLabels = {
  queued: '排队中',
  preparing: '准备中',
  finalizing: '归档中',
  running: '执行中',
  passed: '已通过',
  failed: '失败',
  cancelled: '已停止',
};

function Status({ status }: { status?: RunSummary['status'] }) {
  return (
    <span className={`ws-status ${status || 'none'}`}>
      <span />
      {status ? statusLabels[status] : '未运行'}
    </span>
  );
}

function date(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function duration(run: RunSummary) {
  return run.durationMs == null
    ? '—'
    : run.durationMs < 1000
      ? `${run.durationMs} ms`
      : `${(run.durationMs / 1000).toFixed(1)} s`;
}

type Props = {
  isTests: boolean;
  visibleTests: TestCase[];
  visibleRuns: RunSummary[];
  latestRuns: Map<string, RunSummary>;
  running: boolean;
  starting: boolean;
  exporting: boolean;
  openEditor: (test?: TestCase, duplicate?: boolean) => void;
  openMatrix: (test: TestCase) => void;
  setDeleting: (test: TestCase) => void;
  start: (testId: string) => Promise<void>;
  exportRun: (run: RunSummary) => Promise<void>;
};

export function WorkspaceRows({
  isTests,
  visibleTests,
  visibleRuns,
  latestRuns,
  running,
  starting,
  exporting,
  openEditor,
  openMatrix,
  setDeleting,
  start,
  exportRun,
}: Props) {
  const latest = (id: string) => latestRuns.get(id);

  return (
    <>
      {isTests
        ? visibleTests.map((test) => {
            const run = latest(test.id);

            return (
              <tr key={test.id}>
                <td>
                  <Button
                    onClick={() => openEditor(test)}
                    className="text-left font-medium hover:text-brand-link"
                  >
                    {test.name}
                  </Button>
                  <p className="mt-1 max-w-96 truncate text-xs text-text-subtle">
                    {test.target && test.target.platform !== 'web'
                      ? `${test.target.platform} · ${test.target.appId}`
                      : test.url}
                  </p>
                  {test.tags.length > 0 && (
                    <div className="mt-2 flex gap-1">
                      {test.tags.map((tag, index) => (
                        <span
                          key={`${tag}-${index}`}
                          className="border border-page-line px-1.5 py-0.5 text-xs text-page-muted"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  <Status status={run?.status} />
                </td>
                <td className="text-xs text-page-muted">{date(test.updatedAt)}</td>
                <td>
                  {run ? (
                    <Link
                      href={`/runs/${run.id}`}
                      className="text-xs text-page-muted hover:underline"
                    >
                      {date(run.startedAt)} ↗
                    </Link>
                  ) : (
                    <span className="text-text-faint">—</span>
                  )}
                </td>
                <td>
                  <div className="flex justify-end gap-1">
                    <Button
                      className="ws-button mr-2"
                      title={running ? '请等待当前测试完成后再运行' : '运行测试'}
                      disabled={starting}
                      onClick={() => void start(test.id)}
                    >
                      <Icon name="results" width="14" /> 运行
                    </Button>
                    <Button
                      className="ws-button"
                      disabled={starting}
                      onClick={() => openMatrix(test)}
                    >
                      矩阵运行
                    </Button>
                    <Button
                      className="ws-icon-button"
                      aria-label={`编辑 ${test.name}`}
                      title="编辑"
                      onClick={() => openEditor(test)}
                    >
                      <Icon name="edit" width="16" />
                    </Button>
                    <Button
                      className="ws-icon-button"
                      aria-label={`复制 ${test.name}`}
                      title="复制"
                      onClick={() => openEditor(test, true)}
                    >
                      <Icon name="copy" width="16" />
                    </Button>
                    <Button
                      className="ws-icon-button"
                      aria-label={`删除 ${test.name}`}
                      title="删除"
                      onClick={() => {
                        setDeleting(test);
                      }}
                    >
                      <Icon name="trash" width="16" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })
        : visibleRuns.map((run) => (
            <tr key={run.id}>
              <td>
                <Link href={`/runs/${run.id}`} className="font-medium hover:text-brand-link">
                  {run.name}
                </Link>
                <p className="mt-1 font-mono text-xs text-text-subtle">
                  #{run.id.slice(0, 8)} · {run.url}
                </p>
              </td>
              <td>
                <Status status={run.status} />
              </td>
              <td className="text-xs text-page-muted">{date(run.startedAt)}</td>
              <td className="font-mono text-xs text-page-muted">{duration(run)}</td>
              <td>
                <div className="flex justify-end gap-2">
                  <Link href={`/runs/${run.id}`} className="ws-button">
                    查看详情 <Icon name="chevron" width="13" />
                  </Link>
                  <Button
                    className="ws-icon-button"
                    title="导出结果"
                    aria-label={`导出 ${run.name} 的结果`}
                    disabled={exporting}
                    onClick={() => void exportRun(run)}
                  >
                    <Icon name="download" width="16" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
    </>
  );
}
