'use client';

import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingState } from '@/components/shared/LoadingState';

import clsx from 'clsx';

import workspaceStyles from '@/features/workspace/components/workspace-index.module.css';
import styles from './WorkspaceList.module.css';

import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/Table';
import Link from 'next/link';
import { type ComponentProps, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Icon } from '@iconify/react/offline';
import chevronIcon from '@iconify-icons/lucide/chevron-right';
import searchIcon from '@iconify-icons/lucide/search';
import filesIcon from '@iconify-icons/lucide/files';
import historyIcon from '@iconify-icons/lucide/history';
import { WorkspaceRows } from '@/features/workspace/components/WorkspaceRows';

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
      className={workspaceStyles.workspaceIndexList}
      aria-label={isTests ? '测试用例列表' : '执行记录列表'}
    >
      <div className={workspaceStyles.workspaceIndexToolbar}>
        <div className={clsx(workspaceStyles.workspaceIndexSearch, styles.searchField)}>
          <Icon icon={searchIcon} className={styles.searchIcon} width="16" aria-hidden="true" />
          <Input
            aria-label={isTests ? '搜索测试' : '搜索结果'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isTests ? '搜索用例…' : '搜索执行记录…'}
            className={styles.searchInput}
          />
        </div>
        <div className={workspaceStyles.workspaceIndexFilter}>
          <Select
            aria-label="状态筛选"
            value={filter}
            onValueChange={(value) => setFilter(value)}
            className={styles.statusFilter}
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
        <div className={workspaceStyles.workspaceIndexToolbarActions}>{actions}</div>
      </div>
      {loading ? (
        <LoadingState className={workspaceStyles.workspaceIndexEmpty} message="正在加载工作区…" />
      ) : (isTests ? visibleTests.length === 0 : visibleRuns.length === 0) ? (
        <EmptyState
          data-ui="workspace-index-empty"
          className={workspaceStyles.workspaceIndexEmpty}
          icon={
            <Icon
              icon={query || filter !== 'all' ? searchIcon : isTests ? filesIcon : historyIcon}
              width="28"
              aria-hidden="true"
            />
          }
          title={
            query || filter !== 'all'
              ? '没有符合条件的记录'
              : isTests
                ? '还没有测试用例'
                : '暂无执行记录'
          }
          actions={
            query || filter !== 'all' ? (
              <Button
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                清除筛选
              </Button>
            ) : !isTests ? (
              <Link href="/cases" className={buttonStyles({ size: 'sm' })}>
                浏览测试 <Icon icon={chevronIcon} width="14" aria-hidden="true" />
              </Link>
            ) : null
          }
        />
      ) : (
        <div>
          <p className={styles.scrollHint}>左右滑动查看时间与操作 →</p>
          <div
            className={styles.tableViewport}
            tabIndex={0}
            role="region"
            aria-label="可横向滚动的记录表格"
          >
            <Table
              className={clsx(workspaceStyles.workspaceIndexTable, {
                [workspaceStyles.isResults]: !isTests,
              })}
            >
              <TableHeader className={styles.tableHeader}>
                <TableRow>
                  <TableHead>{isTests ? '用例' : '测试'}</TableHead>
                  <TableHead>{isTests ? '最近状态' : '状态'}</TableHead>
                  <TableHead>{isTests ? '最近执行' : '开始时间'}</TableHead>
                  {!isTests && <TableHead>耗时</TableHead>}
                  <TableHead className={styles.actionsHeading}>操作</TableHead>
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
      <div data-ui="workspace-index-footer" className={workspaceStyles.workspaceIndexFooter}>
        <span>{loading ? '—' : isTests ? visibleTests.length : visibleRuns.length} 条记录</span>
        {running && (
          <span className={workspaceStyles.workspaceIndexLive}>
            <span aria-hidden="true" />
            {connected ? '实时更新' : '自动刷新'}
          </span>
        )}
        {(hasPrevious || hasNext) && (
          <div className={workspaceStyles.workspaceIndexPagination}>
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
