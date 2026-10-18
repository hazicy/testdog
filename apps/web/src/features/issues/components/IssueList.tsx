'use client';

import { useTranslations, useFormatter } from 'next-intl';
import { useIssueLabels, useIssuePresentation } from '@/features/issues/presentation';

import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingState } from '@/components/shared/LoadingState';
import { ListFooter } from '@/components/shared/ListFooter';

import clsx from 'clsx';

import workspaceStyles from '@/features/workspace/components/workspace-index.module.css';
import styles from './IssueList.module.css';

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';

import { SearchInput } from '@/components/shared/SearchInput';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useState } from 'react';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { fetchJson } from '@/client/api';
import { useDebouncedValue } from '@/client/useDebouncedValue';
import { useCursorPagination } from '@/client/useCursorPagination';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { type IssuePage } from '@testdog/contracts/issues/types';
import { IssueEditor, options } from '@/features/issues/components/IssueEditor';
import { Icon } from '@iconify/react/offline';
import plusIcon from '@iconify-icons/lucide/plus';

export function IssueList() {
  const t = useTranslations('issues');
  const format = useFormatter();
  const { issueStatuses, issueSeverities } = useIssueLabels();
  const { relativeTime, environmentLabel } = useIssuePresentation();
  const router = useRouter();
  const [{ q, status, platform, days, sort }, setFilters] = useQueryStates({
    q: parseAsString.withDefault(''),
    status: parseAsStringLiteral([
      'all',
      'open',
      'in_progress',
      'pending_verification',
      'closed',
    ]).withDefault('all'),
    platform: parseAsStringLiteral(['all', 'web', 'android', 'ios']).withDefault('all'),
    days: parseAsStringLiteral(['all', '1', '7', '30']).withDefault('all'),
    sort: parseAsStringLiteral(['last_seen', 'updated']).withDefault('last_seen'),
  });
  const search = useDebouncedValue(q.trim());
  const [creating, setCreating] = useState(false);
  const { cursors, previousPage, nextPage } = useCursorPagination(
    JSON.stringify([search, status, platform, days, sort]),
  );
  const params = new URLSearchParams({ q: search, status, platform, sort });

  if (days !== 'all') params.set('days', days);
  if (cursors.length) params.set('cursor', cursors.at(-1)!);
  const { data, error, isLoading } = useSWR<IssuePage>(`/api/issues?${params}`, fetchJson, {
    refreshInterval: 30000,
  });
  const items = data?.issues ?? [];
  const filtered = !!search || status !== 'all' || platform !== 'all' || days !== 'all';

  return (
    <section
      className={clsx(
        workspaceStyles.workspaceIndex,
        workspaceStyles.dataWorkspace,
        styles.section,
      )}
      aria-label={t('issues')}
    >
      <PageHeader
        title={t('issues')}
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Icon icon={plusIcon} width="16" aria-hidden="true" />
            {t('newIssue')}
          </Button>
        }
      />
      <div
        className={clsx(workspaceStyles.workspaceIndexToolbar, workspaceStyles.issueIndexToolbar)}
      >
        <SearchInput
          className={workspaceStyles.workspaceIndexSearch}
          aria-label={t('search')}
          placeholder={t('searchPlaceholder')}
          maxLength={200}
          value={q}
          onChange={(event) => void setFilters({ q: event.target.value })}
        />
        <div className={clsx(workspaceStyles.workspaceIndexFilter, styles.filters)}>
          <Select
            aria-label={t('filterStatus')}
            className={styles.select}
            value={status}
            onValueChange={(value) => {
              void setFilters({ status: value as typeof status }, { history: 'push' });
            }}
            items={[{ value: 'all', label: t('allStatuses') }, ...options(issueStatuses)]}
          />
          <Select
            aria-label={t('filterEnvironment')}
            className={styles.select}
            value={platform}
            onValueChange={(value) => {
              void setFilters({ platform: value as typeof platform }, { history: 'push' });
            }}
            items={[
              { value: 'all', label: t('allEnvironments') },
              { value: 'web', label: 'Web' },
              { value: 'android', label: 'Android' },
              { value: 'ios', label: 'iOS' },
            ]}
          />
          <Select
            aria-label={t('sort')}
            className={styles.select}
            value={sort}
            onValueChange={(value) => {
              void setFilters({ sort: value as typeof sort }, { history: 'push' });
            }}
            items={[
              { value: 'last_seen', label: t('lastSeenSort') },
              { value: 'updated', label: t('updatedSort') },
            ]}
          />
          <Select
            aria-label={t('filterDate')}
            className={styles.select}
            value={days}
            onValueChange={(value) => {
              void setFilters({ days: value as typeof days }, { history: 'push' });
            }}
            items={[
              { value: 'all', label: t('allDates') },
              { value: '1', label: t('lastDay') },
              { value: '7', label: t('lastWeek') },
              { value: '30', label: t('lastMonth') },
            ]}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error.message}
        </p>
      )}
      {isLoading ? (
        <LoadingState className={workspaceStyles.workspaceIndexEmpty} message={t('loading')} />
      ) : !items.length ? (
        <EmptyState
          data-ui="workspace-index-empty"
          className={workspaceStyles.workspaceIndexEmpty}
          illustration={filtered ? 'search' : 'empty'}
          message={filtered ? t('noMatches') : t('noIssues')}
          actions={
            <Link href="/runs" className={styles.link}>
              {t('viewRuns')}
            </Link>
          }
        />
      ) : (
        <div className={styles.region} tabIndex={0} role="region" aria-label={t('scrollTable')}>
          <Table className={clsx(workspaceStyles.workspaceIndexTable, workspaceStyles.isIssues)}>
            <TableHeader className={styles.tableHeader}>
              <TableRow>
                <TableHead>{t('severity')}</TableHead>
                <TableHead>{t('issue')}</TableHead>
                <TableHead>{t('environment')}</TableHead>
                <TableHead>{t('runCount')}</TableHead>
                <TableHead>{t('lastSeenSort')}</TableHead>
                <TableHead>{t('status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((issue) => (
                <TableRow key={issue.id}>
                  <TableCell>
                    <StatusBadge
                      tone={
                        issue.severity === 'critical' || issue.severity === 'high'
                          ? 'danger'
                          : issue.severity === 'medium'
                            ? 'warning'
                            : 'neutral'
                      }
                      title={issueSeverities[issue.severity]}
                    >
                      {issue.category === 'product' ? 'BUG' : issue.category.toUpperCase()}
                    </StatusBadge>
                    <span className={styles.label}>{issueSeverities[issue.severity]}</span>
                  </TableCell>
                  <TableCell>
                    <Link
                      className={clsx(workspaceStyles.workspaceIndexName, styles.issueLink)}
                      href={`/issues/${issue.id}`}
                    >
                      <span className={workspaceStyles.workspaceIndexNameText} title={issue.title}>
                        {issue.title}
                      </span>
                    </Link>
                    <p className={workspaceStyles.workspaceIndexDescription}>
                      {issue.latestOccurrence?.snapshot.name ?? t('manual')} ·{' '}
                      {issue.latestOccurrence?.snapshot.target?.platform ?? 'Web'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span className={workspaceStyles.workspaceIndexTag}>
                      {environmentLabel(issue.latestOccurrence)}
                    </span>
                  </TableCell>
                  <TableCell>{issue.runCount ?? 0}</TableCell>
                  <TableCell
                    className={clsx(workspaceStyles.workspaceIndexTime, styles.tableCell)}
                    title={format.dateTime(new Date(issue.lastSeen ?? issue.createdAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  >
                    {relativeTime(issue.lastSeen ?? issue.createdAt)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      tone={
                        issue.status === 'closed'
                          ? 'success'
                          : issue.status === 'open'
                            ? 'neutral'
                            : 'warning'
                      }
                    >
                      {issueStatuses[issue.status]}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <ListFooter
        loading={isLoading}
        count={items.length}
        page={cursors.length + 1}
        hasPrevious={cursors.length > 0}
        hasNext={!!data?.nextCursor}
        previousPage={previousPage}
        nextPage={() => nextPage(data?.nextCursor)}
      />
      {creating && (
        <IssueEditor
          onDismiss={() => setCreating(false)}
          onSaved={(issue) => router.push(`/issues/${issue.id}`)}
        />
      )}
    </section>
  );
}
