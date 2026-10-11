'use client';

import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/Table';
import Link from 'next/link';
import { type ComponentProps, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Icon } from '@iconify/react/offline';
import chevronIcon from '@iconify-icons/lucide/chevron-right';
import plusIcon from '@iconify-icons/lucide/plus';
import searchIcon from '@iconify-icons/lucide/search';
import filesIcon from '@iconify-icons/lucide/files';
import historyIcon from '@iconify-icons/lucide/history';
import { WorkspaceRows } from './WorkspaceRows';

type Props = Omit<ComponentProps<typeof WorkspaceRows>, 'visibleTests' | 'visibleRuns'> & {
  tests: ComponentProps<typeof WorkspaceRows>['visibleTests'];
  runs: ComponentProps<typeof WorkspaceRows>['visibleRuns'];
  actions?: ReactNode;
  loading: boolean;
  connected: boolean;
  query: string;
  setQuery: (query: string) => void;
  filter: string;
  setFilter: (filter: string) => void;
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  nextPage: () => void;
  previousPage: () => void;
};

export function WorkspaceList({
  actions,
  query,
  setQuery,
  filter,
  setFilter,
  page,
  hasPrevious,
  hasNext,
  nextPage,
  previousPage,
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
  const visibleTests = tests;
  const visibleRuns = runs;

  return (
    <section
      className="workspace-index-list"
      aria-label={isTests ? '测试用例列表' : '执行记录列表'}
    >
      <div className="workspace-index-toolbar">
        <div className="workspace-index-search relative">
          <Icon
            icon={searchIcon}
            className="absolute top-2.5 left-3 text-text-subtle"
            width="16"
            aria-hidden="true"
          />
          <Input
            aria-label={isTests ? '搜索测试' : '搜索结果'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isTests ? '搜索用例…' : '搜索执行记录…'}
            className="pl-9"
          />
        </div>
        <div className="workspace-index-filter">
          <Select
            aria-label="状态筛选"
            value={filter}
            onValueChange={(value) => setFilter(value)}
            className="w-auto"
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
        <div className="workspace-index-toolbar-actions">{actions}</div>
      </div>
      {loading ? (
        <p role="status" className="p-16 text-center text-sm text-text-subtle">
          正在加载工作区…
        </p>
      ) : (isTests ? visibleTests.length === 0 : visibleRuns.length === 0) ? (
        <div className="workspace-index-empty">
          <Icon
            icon={query || filter !== 'all' ? searchIcon : isTests ? filesIcon : historyIcon}
            width="28"
            className="mb-5 text-page-muted"
            aria-hidden="true"
          />
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
                ? '新建一个用例，开始编排测试步骤。'
                : '运行用例后，在这里查看结果。'}
          </p>
          {query || filter !== 'all' ? (
            <Button
              className="mt-6"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              清除筛选
            </Button>
          ) : isTests ? (
            <Button size="sm" variant="primary" className="mt-6" onClick={() => openEditor()}>
              <Icon icon={plusIcon} width="18" aria-hidden="true" /> 新建测试
            </Button>
          ) : (
            <Link href="/cases" className={buttonStyles({ size: 'sm', className: 'mt-6' })}>
              浏览测试 <Icon icon={chevronIcon} width="14" aria-hidden="true" />
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
            <Table className={`workspace-index-table ${isTests ? 'is-tests' : 'is-results'}`}>
              <TableHeader className="bg-transparent">
                <TableRow>
                  <TableHead>{isTests ? '用例' : '测试'}</TableHead>
                  <TableHead>{isTests ? '最近状态' : '状态'}</TableHead>
                  <TableHead>{isTests ? '最近执行' : '开始时间'}</TableHead>
                  {!isTests && <TableHead>耗时</TableHead>}
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
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
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      <div className="workspace-index-footer">
        <span>{loading ? '—' : isTests ? visibleTests.length : visibleRuns.length} 条记录</span>
        {running && (
          <span className="workspace-index-live">
            <span aria-hidden="true" />
            {connected ? '实时更新' : '自动刷新'}
          </span>
        )}
        {(hasPrevious || hasNext) && (
          <div className="workspace-index-pagination">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="上一页"
              disabled={!hasPrevious || loading}
              onClick={previousPage}
            >
              <Icon icon={chevronIcon} width="14" rotate={2} aria-hidden="true" />
            </Button>
            <span>第 {page} 页</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="下一页"
              disabled={!hasNext || loading}
              onClick={nextPage}
            >
              <Icon icon={chevronIcon} width="14" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
