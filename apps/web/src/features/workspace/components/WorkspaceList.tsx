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
import { useContext, useState, type ComponentProps, type ReactNode } from 'react';
import { FolderTreeContext } from '@/features/suites/context';
import { GroupedCaseRows } from '@/features/suites/components/GroupedCaseRows';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { SearchInput } from '@/components/shared/SearchInput';
import { Checkbox } from '@/components/ui/Checkbox';
import { Select } from '@/components/ui/Select';
import { Icon } from '@iconify/react/offline';
import chevronIcon from '@iconify-icons/lucide/chevron-right';
import pendingIcon from '@iconify-icons/lucide/circle-dashed';
import queuedIcon from '@iconify-icons/lucide/clock';
import preparingIcon from '@iconify-icons/lucide/loader-circle';
import runningIcon from '@iconify-icons/lucide/hourglass';
import finalizingIcon from '@iconify-icons/lucide/circle-dot';
import passedIcon from '@iconify-icons/lucide/circle-check';
import failedIcon from '@iconify-icons/lucide/circle-x';
import cancelledIcon from '@iconify-icons/lucide/circle-minus';

import { WorkspaceRows } from '@/features/workspace/components/WorkspaceRows';

const statusIcons = {
  none: pendingIcon,
  queued: queuedIcon,
  preparing: preparingIcon,
  running: runningIcon,
  finalizing: finalizingIcon,
  passed: passedIcon,
  failed: failedIcon,
  cancelled: cancelledIcon,
};

type Props = Omit<ComponentProps<typeof WorkspaceRows>, 'visibleTests' | 'visibleRuns'> & {
  tests: ComponentProps<typeof WorkspaceRows>['visibleTests'];
  runs: ComponentProps<typeof WorkspaceRows>['visibleRuns'];
  actions?: ReactNode | ((selectedIds: string[], clearSelection: () => void) => ReactNode);
  folderId?: string | null;
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
  folderId,
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
  const tree = useContext(FolderTreeContext);
  const grouped = isTests && !!tree;
  const includeEmpty = !query.trim() && filter === 'all' && page === 1;
  const hasEmptyGroups =
    grouped &&
    includeEmpty &&
    tree.folders.some((folder) => (!folderId || folder.id === folderId) && folder.testCount === 0);
  const Rows = grouped ? GroupedCaseRows : WorkspaceRows;
  const scope = JSON.stringify([query, filter, page, folderId]);
  const [selectionState, setSelectionState] = useState({ scope, ids: new Set<string>() });

  if (selectionState.scope !== scope) {
    setSelectionState({ scope, ids: new Set<string>() });
  }

  const selected = selectionState.scope === scope ? selectionState.ids : new Set<string>();
  const selection = isTests
    ? {
        ids: selected,
        toggle: (ids: string[], checked: boolean) =>
          setSelectionState((current) => {
            const next = new Set(current.scope === scope ? current.ids : []);

            for (const id of ids) {
              if (checked) next.add(id);
              else next.delete(id);
            }

            return { scope, ids: next };
          }),
      }
    : undefined;
  const allSelected = tests.length > 0 && tests.every((test) => selected.has(test.id));
  const someSelected = tests.some((test) => selected.has(test.id));
  const statuses = [
    'all',
    'none',
    'queued',
    'preparing',
    'running',
    'finalizing',
    'passed',
    'failed',
    'cancelled',
  ] as const;

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
        {!isTests && (
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
        )}
        {actions && (
          <div className={workspaceStyles.workspaceIndexToolbarActions}>
            {typeof actions === 'function'
              ? actions(
                  tests.filter((test) => selected.has(test.id)).map((test) => test.id),
                  () => setSelectionState({ scope, ids: new Set<string>() }),
                )
              : actions}
          </div>
        )}
      </div>
      {isTests && (
        <div className={styles.statusTabs} role="group" aria-label={t('statusFilter')}>
          {statuses.map((status) => (
            <button
              type="button"
              key={status}
              aria-pressed={filter === status}
              className={styles.statusTab}
              data-status={status}
              onClick={() => setFilter(status)}
            >
              {status !== 'all' && (
                <Icon icon={statusIcons[status]} width="14" aria-hidden="true" />
              )}
              {t(status === 'all' ? 'allStatuses' : status)}
            </button>
          ))}
        </div>
      )}
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
      ) : (isTests ? tests.length === 0 && !hasEmptyGroups : runs.length === 0) ? (
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
                [workspaceStyles.isGrouped]: grouped,
              })}
            >
              <TableHeader className={styles.tableHeader}>
                <TableRow>
                  <TableHead>
                    <div className={styles.caseHeading}>
                      {selection && (
                        <Checkbox
                          aria-label={t('selectAllCases')}
                          checked={allSelected}
                          indeterminate={someSelected && !allSelected}
                          disabled={!tests.length}
                          onCheckedChange={(checked) =>
                            selection.toggle(
                              tests.map((test) => test.id),
                              checked,
                            )
                          }
                        />
                      )}
                      {isTests ? t('case') : t('test')}
                    </div>
                  </TableHead>
                  <TableHead>{isTests ? t('latestStatus') : t('status')}</TableHead>
                  <TableHead>{isTests ? t('latestRun') : t('startedAt')}</TableHead>
                  {!isTests && <TableHead>{t('duration')}</TableHead>}
                  <TableHead className={styles.actionsHeading}>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Rows
                  selection={selection}
                  includeEmpty={includeEmpty}
                  folderId={folderId}
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
