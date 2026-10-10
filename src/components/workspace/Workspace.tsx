'use client';

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

const statusLabels = { running: '执行中', passed: '已通过', failed: '失败', cancelled: '已停止' };
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
  const selectedId = params.get('run');
  const { counts, latestRuns } = useMemo(() => {
    const counts = { running: 0, passed: 0, failed: 0, cancelled: 0 };
    const latestRuns = new Map<string, RunSummary>();
    for (const run of runs) {
      counts[run.status]++;
      if (run.testId && !latestRuns.has(run.testId)) latestRuns.set(run.testId, run);
    }
    return { counts, latestRuns };
  }, [runs]);
  const running = counts.running > 0;
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
              `${test.name} ${test.url} ${test.tags.join(' ')}`.toLowerCase().includes(keyword) &&
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
            <span className="ml-3 rounded-md bg-[#eeeee9] px-2 py-1 align-middle text-xs font-medium text-[#64665e]">
              {loading ? '—' : isTests ? tests.length : runs.length}
            </span>
          </h1>
          <p className="mt-2 text-sm text-[#737373]">
            {isTests
              ? '管理操作步骤与预期结果，运行浏览器测试。'
              : '查看每次测试的真实结果，定位失败并验证修复。'}
          </p>
        </div>
        <div className="flex gap-2">
          {!isTests && (
            <button className="ws-button" onClick={() => void refresh()}>
              刷新
            </button>
          )}
          {isTests ? (
            <button className="ws-button primary" onClick={() => openEditor()}>
              <Icon name="plus" /> 新建测试
            </button>
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
            value: counts.running,
            note: running ? '结果自动更新' : '等待下一次测试',
          },
        ].map((stat) => (
          <div key={stat.label} className="px-5 py-4">
            <p className="text-xs text-[#78796f]">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{loading ? '—' : stat.value}</p>
            <p className="mt-1 text-xs text-[#73766b]">{stat.note}</p>
          </div>
        ))}
      </div>
      {error && (
        <div
          role="alert"
          className="mt-5 flex items-center justify-between gap-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <span>{error}</span>
          <button onClick={() => void refresh()} className="shrink-0 underline">
            重试
          </button>
        </div>
      )}
      <section
        className="ws-list mt-6 border border-[#e2e1da] bg-[#fffefa]"
        aria-label={isTests ? '测试用例列表' : '执行记录列表'}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e1da] p-4">
          <div className="relative w-full sm:w-80">
            <Icon name="search" className="absolute top-2.5 left-3 text-[#73766b]" width="16" />
            <input
              aria-label={isTests ? '搜索测试' : '搜索结果'}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isTests ? '搜索名称、地址或标签…' : '搜索测试名称或地址…'}
              className="ws-input pl-9"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#73766b]">状态</span>
            <select
              aria-label="状态筛选"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="ws-input w-auto"
            >
              <option value="all">全部状态</option>
              <option value="passed">已通过</option>
              <option value="failed">失败</option>
              <option value="running">执行中</option>
              <option value="cancelled">已停止</option>
              {isTests && <option value="none">未运行</option>}
            </select>
          </div>
        </div>
        {loading ? (
          <p role="status" className="p-16 text-center text-sm text-[#73766b]">
            正在加载工作区…
          </p>
        ) : (isTests ? visibleTests.length === 0 : visibleRuns.length === 0) ? (
          <div className="flex flex-col items-center px-5 py-14 text-center">
            <span className="mb-5 grid h-12 w-12 rounded-lg place-items-center border border-[#e2e1da] bg-[#f5f4ee] text-[#a3a3a3]">
              <Icon name={isTests ? 'tests' : 'results'} width="24" height="24" />
            </span>
            <h2 className="text-base font-medium">
              {query || filter !== 'all'
                ? '没有符合条件的记录'
                : isTests
                  ? '还没有测试用例'
                  : '测试结果会出现在这里'}
            </h2>
            <p className="mt-2 max-w-90 text-sm leading-6 text-[#73766b]">
              {query || filter !== 'all'
                ? '试试其他关键词，或清除状态筛选。'
                : isTests
                  ? '添加网站地址、操作步骤和预期结果。无需编写脚本，就能开始一次浏览器测试。'
                  : '运行一个测试用例，查看执行状态、耗时与详细日志。'}
            </p>
            {query || filter !== 'all' ? (
              <button
                className="ws-button mt-6"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                清除筛选
              </button>
            ) : isTests ? (
              <button className="ws-button primary mt-6" onClick={() => openEditor()}>
                <Icon name="plus" /> 新建测试
              </button>
            ) : (
              <Link href="/cases" className="ws-button mt-6">
                浏览测试 <Icon name="chevron" width="14" />
              </Link>
            )}
          </div>
        ) : (
          <div>
            <p className="border-b border-[#e2e1da] px-4 py-2 text-xs text-[#73766b] sm:hidden">
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
                              <button
                                onClick={() => openEditor(test)}
                                className="text-left font-medium hover:text-[#cf4f2e]"
                              >
                                {test.name}
                              </button>
                              <p className="mt-1 max-w-96 truncate text-xs text-[#73766b]">
                                {test.url}
                              </p>
                              {test.tags.length > 0 && (
                                <div className="mt-2 flex gap-1">
                                  {test.tags.map((tag, index) => (
                                    <span
                                      key={`${tag}-${index}`}
                                      className="border border-[#e2e1da] px-1.5 py-0.5 text-xs text-[#78796f]"
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
                            <td className="text-xs text-[#78796f]">{date(test.updatedAt)}</td>
                            <td>
                              {run ? (
                                <Link
                                  href={`/runs/${run.id}`}
                                  className="text-xs text-[#78796f] hover:underline"
                                >
                                  {date(run.startedAt)} ↗
                                </Link>
                              ) : (
                                <span className="text-[#aaa]">—</span>
                              )}
                            </td>
                            <td>
                              <div className="flex justify-end gap-1">
                                <button
                                  className="ws-button mr-2"
                                  title={running ? '请等待当前测试完成后再运行' : '运行测试'}
                                  disabled={running || starting}
                                  onClick={() => void start(test.id)}
                                >
                                  <Icon name="results" width="14" /> 运行
                                </button>
                                <button
                                  className="ws-icon-button"
                                  aria-label={`编辑 ${test.name}`}
                                  title="编辑"
                                  onClick={() => openEditor(test)}
                                >
                                  <Icon name="edit" width="16" />
                                </button>
                                <button
                                  className="ws-icon-button"
                                  aria-label={`复制 ${test.name}`}
                                  title="复制"
                                  onClick={() => openEditor(test, true)}
                                >
                                  <Icon name="copy" width="16" />
                                </button>
                                <button
                                  className="ws-icon-button"
                                  aria-label={`删除 ${test.name}`}
                                  title="删除"
                                  onClick={() => {
                                    setDeleting(test);
                                  }}
                                >
                                  <Icon name="trash" width="16" />
                                </button>
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
                              className="font-medium hover:text-[#cf4f2e]"
                            >
                              {run.name}
                            </Link>
                            <p className="mt-1 font-mono text-xs text-[#73766b]">
                              #{run.id.slice(0, 8)} · {run.url}
                            </p>
                          </td>
                          <td>
                            <Status status={run.status} />
                          </td>
                          <td className="text-xs text-[#78796f]">{date(run.startedAt)}</td>
                          <td className="font-mono text-xs text-[#78796f]">{duration(run)}</td>
                          <td>
                            <div className="flex justify-end gap-2">
                              <Link href={`/runs/${run.id}`} className="ws-button">
                                查看详情 <Icon name="chevron" width="13" />
                              </Link>
                              <button
                                className="ws-icon-button"
                                title="导出结果"
                                aria-label={`导出 ${run.name} 的结果`}
                                disabled={exporting}
                                onClick={() => void exportRun(run)}
                              >
                                <Icon name="download" width="16" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-[#e2e1da] px-4 py-3 text-xs text-[#73766b]">
          <span>{isTests ? visibleTests.length : visibleRuns.length} 条记录</span>
          <span className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${running ? 'bg-[#f16b43]' : 'bg-[#8da58c]'}`}
            />
            {running ? '执行中 · 每 2 秒更新' : '执行记录持久保存'}
          </span>
        </div>
      </section>
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
