'use client';

import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingState } from '@/components/shared/LoadingState';
import { ListFooter } from '@/components/shared/ListFooter';

import clsx from 'clsx';

import workspaceStyles from '@/features/workspace/components/workspace-index.module.css';
import styles from './WorkspaceList.module.css';

import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/Table';
import Link from 'next/link';
import { type ComponentProps, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { SearchInput } from '@/components/shared/SearchInput';
import { Select } from '@/components/ui/Select';
import { Icon } from '@iconify/react/offline';
import chevronIcon from '@iconify-icons/lucide/chevron-right';
import { WorkspaceRows } from '@/features/workspace/components/WorkspaceRows';

type Props = Omit<ComponentProps<typeof WorkspaceRows>, 'visibleTests' | 'visibleRuns'> & {
  tests: ComponentProps<typeof WorkspaceRows>['visibleTests'];
  runs: ComponentProps<typeof WorkspaceRows>['visibleRuns'];
  actions?: ReactNode;
  loading: boolean;
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
  starting,
  exporting,
  openEditor,
  setDeleting,
  start,
  exportRun,
}: Props) {
  const t = useTranslations('workspace');

  return (
    <section
      className={workspaceStyles.workspaceIndexList}
      aria-label={isTests ? t('testList') : t('runList')}
    >
      <div className={workspaceStyles.workspaceIndexToolbar}>
        <SearchInput
          className={workspaceStyles.workspaceIndexSearch}
          aria-label={isTests ? t('searchTests') : t('searchResults')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={isTests ? t('testPlaceholder') : t('runPlaceholder')}
        />
        <div className={workspaceStyles.workspaceIndexFilter}>
          <Select
            aria-label={t('statusFilter')}
            value={filter}
            onValueChange={(value) => setFilter(value)}
            className={styles.statusFilter}
            items={[
              { value: 'all', label: t('allStatuses') },
              { value: 'passed', label: t('passed') },
              { value: 'failed', label: t('failed') },
              { value: 'queued', label: t('queued') },
              { value: 'preparing', label: t('preparing') },
              { value: 'finalizing', label: t('finalizing') },
              { value: 'running', label: t('running') },
              { value: 'cancelled', label: t('cancelled') },
              isTests && { value: 'none', label: t('none') },
            ]}
          />
        </div>
        {actions && <div className={workspaceStyles.workspaceIndexToolbarActions}>{actions}</div>}
      </div>
      {loading ? (
        isTests ? (
          <div className={workspaceStyles.caseSkeleton} role="status" aria-label={t('loading')}>
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className={workspaceStyles.skeletonRow} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            ))}
          </div>
        ) : (
          <LoadingState className={workspaceStyles.workspaceIndexEmpty} message={t('loading')} />
        )
      ) : (isTests ? tests.length === 0 : runs.length === 0) ? (
        <EmptyState
          data-ui="workspace-index-empty"
          className={workspaceStyles.workspaceIndexEmpty}
          illustration={query || filter !== 'all' ? 'search' : isTests ? 'tests' : 'runs'}
          message={
            query || filter !== 'all' ? t('noMatches') : isTests ? t('noTests') : t('noRuns')
          }
          actions={
            query || filter !== 'all' ? (
              <Button
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                {t('clearFilters')}
              </Button>
            ) : !isTests ? (
              <Link href="/cases" className={buttonStyles({ size: 'sm' })}>
                {t('browseTests')} <Icon icon={chevronIcon} width="14" aria-hidden="true" />
              </Link>
            ) : null
          }
        />
      ) : (
        <div>
          <p className={styles.scrollHint}>{t('scrollHint')}</p>
          <div className={styles.tableViewport} tabIndex={0} role="region" aria-label={t('table')}>
            <Table
              className={clsx(workspaceStyles.workspaceIndexTable, {
                [workspaceStyles.isResults]: !isTests,
              })}
            >
              <TableHeader className={styles.tableHeader}>
                <TableRow>
                  <TableHead>{isTests ? t('case') : t('test')}</TableHead>
                  <TableHead>{isTests ? t('latestStatus') : t('status')}</TableHead>
                  <TableHead>{isTests ? t('latestRun') : t('startedAt')}</TableHead>
                  {!isTests && <TableHead>{t('duration')}</TableHead>}
                  <TableHead className={styles.actionsHeading}>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <WorkspaceRows
                  isTests={isTests}
                  visibleTests={tests}
                  visibleRuns={runs}
                  latestRuns={latestRuns}
                  running={running}
                  starting={starting}
                  exporting={exporting}
                  openEditor={openEditor}
                  setDeleting={setDeleting}
                  start={start}
                  exportRun={exportRun}
                />
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      <ListFooter
        loading={loading}
        count={isTests ? tests.length : runs.length}
        page={page}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        previousPage={previousPage}
        nextPage={nextPage}
      />
    </section>
  );
}
