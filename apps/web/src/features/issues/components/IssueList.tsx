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

import { Input } from '@/components/ui/Input';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { fetchJson } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { type IssuePage } from '@testdog/contracts/issues/types';
import { IssueEditor, options } from '@/features/issues/components/IssueEditor';
import { Icon } from '@iconify/react/offline';
import searchIcon from '@iconify-icons/lucide/search';
import plusIcon from '@iconify-icons/lucide/plus';

export function IssueList() {
  const t = useTranslations('issues');
  const format = useFormatter();
  const { issueStatuses, issueSeverities } = useIssueLabels();
  const { relativeTime, environmentLabel } = useIssuePresentation();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [days, setDays] = useState('all');
  const [sort, setSort] = useState('last_seen');
  const [creating, setCreating] = useState(false);
  const [cursors, setCursors] = useState<string[]>([]);

  useEffect(() => {
    if (q.trim() === search) return;
    const timer = setTimeout(() => {
      setSearch(q.trim());
      setCursors([]);
    }, 250);

    return () => clearTimeout(timer);
  }, [q, search]);
  const params = new URLSearchParams({ q: search, status, platform, sort });

  if (days !== 'all') params.set('days', days);
  if (cursors.length) params.set('cursor', cursors.at(-1)!);
  const { data, error, isLoading } = useSWR<IssuePage>(`/api/issues?${params}`, fetchJson, {
    refreshInterval: 30000,
  });
  const items = data?.issues ?? [];

  return (
    <section
      className={clsx(workspaceStyles.workspaceIndex, styles.section)}
      aria-label={t('issues')}
    >
      <h1 className={styles.accessibleLabel}>{t('issues')}</h1>
      <div
        className={clsx(workspaceStyles.workspaceIndexToolbar, workspaceStyles.issueIndexToolbar)}
      >
        <div className={clsx(workspaceStyles.workspaceIndexSearch, styles.container)}>
          <Icon icon={searchIcon} width="16" className={styles.icon} aria-hidden="true" />
          <Input
            aria-label={t('search')}
            className={styles.input}
            placeholder={t('searchPlaceholder')}
            maxLength={200}
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <div className={clsx(workspaceStyles.workspaceIndexFilter, styles.filters)}>
          <Select
            aria-label={t('filterStatus')}
            className={styles.select}
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setCursors([]);
            }}
            items={[{ value: 'all', label: t('allStatuses') }, ...options(issueStatuses)]}
          />
          <Select
            aria-label={t('filterEnvironment')}
            className={styles.select}
            value={platform}
            onValueChange={(value) => {
              setPlatform(value);
              setCursors([]);
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
              setSort(value);
              setCursors([]);
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
              setDays(value);
              setCursors([]);
            }}
            items={[
              { value: 'all', label: t('allDates') },
              { value: '1', label: t('lastDay') },
              { value: '7', label: t('lastWeek') },
              { value: '30', label: t('lastMonth') },
            ]}
          />
        </div>
        <div className={workspaceStyles.workspaceIndexToolbarActions}>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Icon icon={plusIcon} width="16" aria-hidden="true" />
            {t('newIssue')}
          </Button>
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
          illustration={search || status !== 'all' ? 'search' : 'empty'}
          message={search || status !== 'all' ? t('noMatches') : t('noIssues')}
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
                    <span
                      className={clsx(workspaceStyles.workspaceIndexTag, styles.categoryBadge)}
                      title={issueSeverities[issue.severity]}
                    >
                      {issue.category === 'product' ? 'BUG' : issue.category.toUpperCase()}
                    </span>
                    <span className={styles.label}>{issueSeverities[issue.severity]}</span>
                  </TableCell>
                  <TableCell>
                    <Link
                      className={clsx(workspaceStyles.workspaceIndexName, styles.issueLink)}
                      href={`/issues/${issue.id}`}
                    >
                      {issue.title}
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
                  <TableCell className={styles.mutedText}>{issueStatuses[issue.status]}</TableCell>
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
        previousPage={() => setCursors(cursors.slice(0, -1))}
        nextPage={() => {
          if (data?.nextCursor) setCursors([...cursors, data.nextCursor]);
        }}
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
