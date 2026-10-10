'use client';
import Link from 'next/link';
import { useMemo, useState, type ComponentProps } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { WorkspaceIcon as Icon } from '@/components/shared/WorkspaceIcon';
import { WorkspaceRows } from './WorkspaceRows';

type Props = Omit<ComponentProps<typeof WorkspaceRows>, 'visibleTests' | 'visibleRuns'> & {
  tests: ComponentProps<typeof WorkspaceRows>['visibleTests'];
  runs: ComponentProps<typeof WorkspaceRows>['visibleRuns'];
  loading: boolean;
  connected: boolean;
};

export function WorkspaceList({
  isTests,
  tests,
  runs,
  loading,
  latestRuns,
  running,
  connected,
  starting,
  exporting,
  openEditor,
  openMatrix,
  setDeleting,
  start,
  exportRun,
}: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
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

  return (
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
                <WorkspaceRows
                  isTests={isTests}
                  visibleTests={visibleTests}
                  visibleRuns={visibleRuns}
                  latestRuns={latestRuns}
                  running={running}
                  starting={starting}
                  exporting={exporting}
                  openEditor={openEditor}
                  openMatrix={openMatrix}
                  setDeleting={setDeleting}
                  start={start}
                  exportRun={exportRun}
                />
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
          {running ? (connected ? '执行中 · 实时更新' : '执行中 · 自动刷新') : '执行记录持久保存'}
        </span>
      </div>
    </section>
  );
}
