import { statusStyles } from '@/components/ui/statusStyles';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { Icon } from '@iconify/react/offline';
import chevronIcon from '@iconify-icons/lucide/chevron-right';
import copyIcon from '@iconify-icons/lucide/copy';
import downloadIcon from '@iconify-icons/lucide/download';
import editIcon from '@iconify-icons/lucide/pencil';
import resultsIcon from '@iconify-icons/lucide/play';
import trashIcon from '@iconify-icons/lucide/trash-2';
import matrixIcon from '@iconify-icons/lucide/grid-2x2';
import checkIcon from '@iconify-icons/lucide/circle-check';
import failIcon from '@iconify-icons/lucide/circle-x';
import pendingIcon from '@iconify-icons/lucide/circle-dashed';
import stoppedIcon from '@iconify-icons/lucide/circle-minus';
import { WorkspaceRowMenu } from './WorkspaceRowMenu';
import type { TestCase } from '@/features/test-cases/types';
import type { RunSummary } from '@/features/runs/types';

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
    <span
      data-slot="status"
      data-status={status || 'none'}
      className={statusStyles(status || 'none')}
    >
      <Icon
        icon={
          status === 'passed'
            ? checkIcon
            : status === 'failed'
              ? failIcon
              : status === 'cancelled'
                ? stoppedIcon
                : pendingIcon
        }
        width="14"
        aria-hidden="true"
      />
      {status ? statusLabels[status] : '未运行'}
    </span>
  );
}

function address(value: string) {
  try {
    const url = new URL(value);

    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return value;
  }
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
                  <div className="workspace-index-title">
                    <Button
                      onClick={() => openEditor(test)}
                      variant="ghost"
                      className="workspace-index-name text-left font-medium text-ink hover:text-brand-link min-h-0 rounded-none p-0 whitespace-normal"
                    >
                      {test.name}
                    </Button>
                    {test.tags.length > 0 && (
                      <div className="workspace-index-tags">
                        {test.tags.map((tag, index) => (
                          <span key={`${tag}-${index}`} className="workspace-index-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="workspace-index-description">
                    {test.target && test.target.platform !== 'web'
                      ? `${test.target.platform} · ${test.target.appId}`
                      : address(test.url)}
                  </p>
                </td>
                <td>
                  <Status status={run?.status} />
                </td>
                <td>
                  {run ? (
                    <Link
                      href={`/runs/${run.id}`}
                      className="text-xs text-page-muted hover:underline"
                    >
                      <time
                        dateTime={run.startedAt}
                        title={new Date(run.startedAt).toLocaleString('zh-CN')}
                      >
                        {date(run.startedAt)}
                      </time>
                    </Link>
                  ) : (
                    <span className="text-text-faint">—</span>
                  )}
                </td>
                <td>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="xs"
                      title={running ? '请等待当前测试完成后再运行' : '运行测试'}
                      disabled={starting}
                      onClick={() => void start(test.id)}
                    >
                      <Icon icon={resultsIcon} width="14" aria-hidden="true" /> 运行
                    </Button>
                    <WorkspaceRowMenu
                      label={`更多操作：${test.name}`}
                      actions={[
                        {
                          label: '编辑用例',
                          accessibleLabel: `编辑 ${test.name}`,
                          icon: editIcon,
                          onSelect: () => openEditor(test),
                        },
                        {
                          label: '复制用例',
                          accessibleLabel: `复制 ${test.name}`,
                          icon: copyIcon,
                          onSelect: () => openEditor(test, true),
                        },
                        {
                          label: '矩阵运行',
                          accessibleLabel: `矩阵运行 ${test.name}`,
                          icon: matrixIcon,
                          disabled: starting,
                          onSelect: () => openMatrix(test),
                        },
                        {
                          label: '删除用例',
                          accessibleLabel: `删除 ${test.name}`,
                          icon: trashIcon,
                          danger: true,
                          onSelect: () => setDeleting(test),
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            );
          })
        : visibleRuns.map((run) => (
            <tr key={run.id}>
              <td>
                <Link
                  href={`/runs/${run.id}`}
                  className="workspace-index-name font-medium hover:text-brand-link"
                >
                  {run.name}
                </Link>
                <p className="workspace-index-description">
                  <span className="workspace-index-id">#{run.id.slice(0, 8)}</span>
                  <span className="workspace-index-meta-separator" aria-hidden="true">
                    ·
                  </span>
                  {address(run.url)}
                </p>
              </td>
              <td>
                <Status status={run.status} />
              </td>
              <td className="workspace-index-time">
                <time
                  dateTime={run.startedAt}
                  title={new Date(run.startedAt).toLocaleString('zh-CN')}
                >
                  {date(run.startedAt)}
                </time>
              </td>
              <td className="font-mono text-xs text-page-muted">{duration(run)}</td>
              <td>
                <div className="flex justify-end gap-2">
                  <Link
                    href={`/runs/${run.id}`}
                    className={buttonStyles({
                      size: 'xs',
                      variant: 'ghost',
                    })}
                  >
                    详情 <Icon icon={chevronIcon} width="13" aria-hidden="true" />
                  </Link>
                  <WorkspaceRowMenu
                    label={`更多操作：${run.name}`}
                    actions={[
                      {
                        label: '导出结果',
                        accessibleLabel: `导出 ${run.name} 的结果`,
                        icon: downloadIcon,
                        disabled: exporting,
                        onSelect: () => void exportRun(run),
                      },
                    ]}
                  />
                </div>
              </td>
            </tr>
          ))}
    </>
  );
}
