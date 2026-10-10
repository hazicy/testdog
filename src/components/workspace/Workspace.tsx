'use client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TestCase, TestRun, RunSummary } from '@/workspace/types';
import { WorkspaceIcon as Icon } from '../shared/WorkspaceIcon';
import { requestJson as api } from '@/client/api';
import { usePolling } from '@/client/usePolling';
import { downloadRunReport } from '@/client/download';
import { TestEditor } from './TestEditor';
import { DeleteTestDialog } from './DeleteTestDialog';
import { Dialog } from '../shared/Dialog';

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
const json = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export function Workspace({ view }: { view: 'tests' | 'results' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [tests, setTests] = useState<TestCase[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [starting, setStarting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState<{ test?: TestCase; duplicate?: boolean }>();
  const [deleting, setDeleting] = useState<TestCase | null>(null);
  const [matrixTest, setMatrixTest] = useState<TestCase | null>(null);
  const [matrixCode, setMatrixCode] = useState('');
  const [matrixError, setMatrixError] = useState('');
  const selectedId = params.get('run');
  const { counts, latestRuns } = useMemo(() => {
    const counts = {
      queued: 0,
      preparing: 0,
      finalizing: 0,
      running: 0,
      passed: 0,
      failed: 0,
      cancelled: 0,
    };
    const latestRuns = new Map<string, RunSummary>();
    for (const run of runs) {
      counts[run.status]++;
      if (run.testId && !latestRuns.has(run.testId)) latestRuns.set(run.testId, run);
    }
    return { counts, latestRuns };
  }, [runs]);
  const running = counts.running + counts.queued + counts.preparing + counts.finalizing > 0;
  const isTests = view === 'tests';

  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const [testData, runData] = await Promise.all([
          isTests ? api<{ tests: TestCase[] }>('/api/tests', { signal }) : undefined,
          api<{ runs: RunSummary[] }>('/api/runs', { signal }),
        ]);
        if (signal.aborted) return;
        if (testData) setTests(testData.tests);
        setRuns(runData.runs);
        setError('');
      } catch (cause) {
        if (signal.aborted) return;
        setError(cause instanceof Error ? cause.message : '无法加载工作区');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [isTests],
  );
  const refresh = usePolling(load, running ? 2000 : 15000);
  useEffect(() => {
    if (selectedId) router.replace(`/runs/${selectedId}`);
  }, [selectedId, router]);
  function openEditor(test?: TestCase, duplicate = false) {
    setEditing({ test, duplicate });
  }
  async function start(testId: string) {
    setStarting(true);
    setError('');
    try {
      const { run } = await api<{ run: TestRun }>('/api/runs', json({ testId }));
      router.push(`/runs/${run.id}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启动失败');
    } finally {
      setStarting(false);
    }
  }
  function openMatrix(test: TestCase) {
    setMatrixTest(test);
    setMatrixError('');
    const target = test.target || {
      schemaVersion: 1,
      platform: 'web',
      url: test.url,
      browser: 'chromium',
      deviceProfile: 'legacy-desktop',
    };
    setMatrixCode(JSON.stringify([{ target, goal: test.goal }], null, 2));
  }
  async function startMatrix(event: React.FormEvent) {
    event.preventDefault();
    if (!matrixTest) return;
    setStarting(true);
    setMatrixError('');
    try {
      await api(
        '/api/run-batches',
        json({ testId: matrixTest.id, variants: JSON.parse(matrixCode) }),
      );
      setMatrixTest(null);
      router.push('/runs');
      await refresh();
    } catch (cause) {
      setMatrixError(cause instanceof Error ? cause.message : '矩阵启动失败');
    } finally {
      setStarting(false);
    }
  }
  async function exportRun(run: RunSummary) {
    setExporting(true);
    setError('');
    try {
      await downloadRunReport(run.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出失败');
    } finally {
      setExporting(false);
    }
  }
  const latest = (id: string) => latestRuns.get(id);
  const keyword = query.toLowerCase();
  const visibleTests = useMemo(
    () =>
      isTests
        ? tests.filter(
            (test) =>
              `${test.name} ${test.target && test.target.platform !== 'web' ? `${test.target.platform} · ${test.target.appId}` : test.url} ${test.tags.join(' ')}`
                .toLowerCase()
                .includes(keyword) &&
              (filter === 'all' || (latestRuns.get(test.id)?.status || 'none') === filter),
          )
        : [],
    [isTests, tests, keyword, filter, latestRuns],
  );
  const visibleRuns = useMemo(
    () =>
      isTests
        ? []
        : runs.filter(
            (run) =>
              `${run.name} ${run.url}`.toLowerCase().includes(keyword) &&
              (filter === 'all' || run.status === filter),
          ),
    [isTests, runs, keyword, filter],
  );
  const finished = counts.passed + counts.failed;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isTests ? '测试用例' : '执行记录'}
            <span className="ml-3 rounded-md bg-badge-surface px-2 py-1 align-middle text-xs font-medium text-badge-ink">
              {loading ? '—' : isTests ? tests.length : runs.length}
            </span>
          </h1>
          <p className="mt-2 text-sm text-text-neutral">
            {isTests
              ? '管理操作步骤与预期结果，运行浏览器测试。'
              : '查看每次测试的真实结果，定位失败并验证修复。'}
          </p>
        </div>
        <div className="flex gap-2">
          {!isTests && (
            <Button className="ws-button" onClick={() => void refresh()}>
              刷新
            </Button>
          )}
          {isTests ? (
            <Button className="ws-button primary" onClick={() => openEditor()}>
              <Icon name="plus" /> 新建测试
            </Button>
          ) : (
            <Link href="/cases" className="ws-button primary">
              <Icon name="tests" /> 前往测试
            </Link>
          )}
        </div>
      </div>
      <div className="ws-stats mt-7 grid grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: isTests ? '测试用例' : '总执行次数',
            value: isTests ? tests.length : runs.length,
            note: isTests ? '保存的测试场景' : '全部历史记录',
          },
          {
            label: '通过率',
            value: finished ? `${Math.round((counts.passed / finished) * 100)}%` : '—',
            note: '已完成的执行',
          },
          {
            label: '失败记录',
            value: counts.failed,
            note: '需要关注的执行',
          },
          {
            label: '执行中',
            value: counts.running + counts.queued + counts.preparing + counts.finalizing,
            note: running ? '结果自动更新' : '等待下一次测试',
          },
        ].map((stat) => (
          <div key={stat.label} className="px-5 py-4">
            <p className="text-xs text-page-muted">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{loading ? '—' : stat.value}</p>
            <p className="mt-1 text-xs text-text-subtle">{stat.note}</p>
          </div>
        ))}
      </div>
      {error && (
        <div
          role="alert"
          className="mt-5 flex items-center justify-between gap-4 border border-error-line bg-error-soft p-3 text-sm text-error-ink"
        >
          <span>{error}</span>
          <Button onClick={() => void refresh()} className="shrink-0 underline">
            重试
          </Button>
        </div>
      )}
      <section
        className="ws-list mt-6 border border-page-line bg-surface"
        aria-label={isTests ? '测试用例列表' : '执行记录列表'}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-page-line p-4">
          <div className="relative w-full sm:w-80">
            <Icon name="search" className="absolute top-2.5 left-3 text-text-subtle" width="16" />
            <Input
              aria-label={isTests ? '搜索测试' : '搜索结果'}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isTests ? '搜索名称、地址或标签…' : '搜索测试名称或地址…'}
              className="ws-input pl-9"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-subtle">状态</span>
            <Select
              aria-label="状态筛选"
              value={filter}
              onValueChange={(value) => setFilter(value)}
              className="ws-input w-auto"
              items={[
                { value: 'all', label: '全部状态' },
                { value: 'passed', label: '已通过' },
                { value: 'failed', label: '失败' },
                { value: 'queued', label: '排队中' },
                { value: 'preparing', label: '准备中' },
                { value: 'finalizing', label: '归档中' },
                { value: 'running', label: '执行中' },
                { value: 'cancelled', label: '已停止' },
                isTests && { value: 'none', label: '未运行' },
              ]}
            />
          </div>
        </div>
        {loading ? (
          <p role="status" className="p-16 text-center text-sm text-text-subtle">
            正在加载工作区…
          </p>
        ) : (isTests ? visibleTests.length === 0 : visibleRuns.length === 0) ? (
          <div className="flex flex-col items-center px-5 py-14 text-center">
            <span className="mb-5 grid h-12 w-12 rounded-lg place-items-center border border-page-line bg-surface-muted text-text-disabled">
              <Icon name={isTests ? 'tests' : 'results'} width="24" height="24" />
            </span>
            <h2 className="text-base font-medium">
              {query || filter !== 'all'
                ? '没有符合条件的记录'
                : isTests
                  ? '还没有测试用例'
                  : '测试结果会出现在这里'}
            </h2>
            <p className="mt-2 max-w-90 text-sm leading-6 text-text-subtle">
              {query || filter !== 'all'
                ? '试试其他关键词，或清除状态筛选。'
                : isTests
                  ? '添加网站地址、操作步骤和预期结果。无需编写脚本，就能开始一次浏览器测试。'
                  : '运行一个测试用例，查看执行状态、耗时与详细日志。'}
            </p>
            {query || filter !== 'all' ? (
              <Button
                className="ws-button mt-6"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                清除筛选
              </Button>
            ) : isTests ? (
              <Button className="ws-button primary mt-6" onClick={() => openEditor()}>
                <Icon name="plus" /> 新建测试
              </Button>
            ) : (
              <Link href="/cases" className="ws-button mt-6">
                浏览测试 <Icon name="chevron" width="14" />
              </Link>
            )}
          </div>
        ) : (
          <div>
            <p className="border-b border-page-line px-4 py-2 text-xs text-text-subtle sm:hidden">
              左右滑动查看时间与操作 →
            </p>
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="可横向滚动的记录表格"
            >
              <table className="ws-table">
                <thead>
                  <tr>
                    <th>{isTests ? '测试名称' : '执行 / 测试名称'}</th>
                    <th>{isTests ? '最近状态' : '状态'}</th>
                    <th>{isTests ? '更新时间' : '开始时间'}</th>
                    <th>{isTests ? '最近执行' : '耗时'}</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
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
                            <Link
                              href={`/runs/${run.id}`}
                              className="font-medium hover:text-brand-link"
                            >
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
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-page-line px-4 py-3 text-xs text-text-subtle">
          <span>{isTests ? visibleTests.length : visibleRuns.length} 条记录</span>
          <span className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${running ? 'bg-activity-running' : 'bg-activity-idle'}`}
            />
            {running ? '执行中 · 每 2 秒更新' : '执行记录持久保存'}
          </span>
        </div>
      </section>
      {matrixTest && (
        <Dialog
          titleId="matrix-title"
          busy={starting}
          onDismiss={() => setMatrixTest(null)}
          initialFocus='[aria-label="运行配置（JSON）"]'
        >
          <form onSubmit={(event) => void startMatrix(event)}>
            <div className="ws-dialog-header">
              <h2 id="matrix-title" className="text-lg font-semibold">
                平台矩阵 · {matrixTest?.name}
              </h2>
            </div>
            <div className="space-y-4 p-6">
              <p className="text-sm text-page-muted">
                填写 1–10 个运行配置。每项包含 target，可用 goal
                覆盖该平台的步骤与预期。所有运行一起创建，各自排队。
              </p>
              <label className="ws-label">
                运行配置（JSON）
                <textarea
                  className="ws-input min-h-72 font-mono text-xs"
                  required
                  aria-label="运行配置（JSON）"
                  value={matrixCode}
                  disabled={starting}
                  onChange={(event) => setMatrixCode(event.target.value)}
                />
              </label>
              <details className="text-xs text-page-muted">
                <summary>平台配置示例</summary>
                <pre className="mt-2 overflow-auto">
                  {JSON.stringify(
                    [
                      {
                        target: {
                          platform: 'web',
                          url: 'https://example.com',
                          browser: 'chromium',
                          deviceProfile: 'Pixel 7',
                        },
                      },
                      {
                        target: {
                          platform: 'android',
                          appId: 'com.example.app',
                          deviceProfileId: 'android-phone',
                          resetPolicy: 'preserve',
                        },
                      },
                      {
                        target: {
                          platform: 'ios',
                          appId: 'com.example.app',
                          deviceProfileId: 'iphone-simulator',
                          resetPolicy: 'preserve',
                        },
                      },
                    ],
                    null,
                    2,
                  )}
                </pre>
              </details>
              {matrixError && (
                <p role="alert" className="text-sm text-error-ink">
                  {matrixError}
                </p>
              )}
            </div>
            <div className="ws-dialog-footer">
              <Button
                type="button"
                className="ws-button"
                disabled={starting}
                onClick={() => setMatrixTest(null)}
              >
                取消
              </Button>
              <Button type="submit" className="ws-button primary" disabled={starting}>
                {starting ? '创建中…' : '运行矩阵'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {editing && (
        <TestEditor
          {...editing}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await refresh();
          }}
        />
      )}
      {deleting && (
        <DeleteTestDialog
          test={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={async () => {
            await refresh();
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
