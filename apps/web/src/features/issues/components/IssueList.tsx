'use client';

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
import { issueStatuses, issueSeverities, type IssuePage } from '@testdog/contracts/issues/types';
import { IssueEditor, options } from '@/features/issues/components/IssueEditor';
import { environmentLabel, relativeTime } from '@/features/issues/presentation';
import { Icon } from '@iconify/react/offline';
import searchIcon from '@iconify-icons/lucide/search';
import plusIcon from '@iconify-icons/lucide/plus';

export function IssueList() {
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
    <section className={clsx(workspaceStyles.workspaceIndex, styles.section)} aria-label="问题追踪">
      <h1 className={styles.accessibleLabel}>问题追踪</h1>
      <div
        className={clsx(workspaceStyles.workspaceIndexToolbar, workspaceStyles.issueIndexToolbar)}
      >
        <div className={clsx(workspaceStyles.workspaceIndexSearch, styles.container)}>
          <Icon icon={searchIcon} width="16" className={styles.icon} aria-hidden="true" />
          <Input
            aria-label="搜索问题"
            className={styles.input}
            placeholder="搜索问题…"
            maxLength={200}
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <div className={clsx(workspaceStyles.workspaceIndexFilter, styles.filters)}>
          <Select
            aria-label="筛选问题状态"
            className={styles.select}
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setCursors([]);
            }}
            items={[{ value: 'all', label: '全部状态' }, ...options(issueStatuses)]}
          />
          <Select
            aria-label="筛选环境"
            className={styles.select}
            value={platform}
            onValueChange={(value) => {
              setPlatform(value);
              setCursors([]);
            }}
            items={[
              { value: 'all', label: '全部环境' },
              { value: 'web', label: 'Web' },
              { value: 'android', label: 'Android' },
              { value: 'ios', label: 'iOS' },
            ]}
          />
          <Select
            aria-label="问题排序"
            className={styles.select}
            value={sort}
            onValueChange={(value) => {
              setSort(value);
              setCursors([]);
            }}
            items={[
              { value: 'last_seen', label: '最近出现 ↓' },
              { value: 'updated', label: '最近更新 ↓' },
            ]}
          />
          <Select
            aria-label="筛选日期"
            className={styles.select}
            value={days}
            onValueChange={(value) => {
              setDays(value);
              setCursors([]);
            }}
            items={[
              { value: 'all', label: '全部日期' },
              { value: '1', label: '最近 24 小时' },
              { value: '7', label: '最近 7 天' },
              { value: '30', label: '最近 30 天' },
            ]}
          />
        </div>
        <div className={workspaceStyles.workspaceIndexToolbarActions}>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Icon icon={plusIcon} width="16" aria-hidden="true" />
            新建问题
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error.message}
        </p>
      )}
      {isLoading ? (
        <LoadingState className={workspaceStyles.workspaceIndexEmpty} message="正在加载问题…" />
      ) : !items.length ? (
        <EmptyState
          data-ui="workspace-index-empty"
          className={workspaceStyles.workspaceIndexEmpty}
          illustration={search || status !== 'all' ? 'search' : 'empty'}
          message={search || status !== 'all' ? '没有匹配的问题' : '暂无问题'}
          actions={
            <Link href="/runs" className={styles.link}>
              查看执行记录
            </Link>
          }
        />
      ) : (
        <div className={styles.region} tabIndex={0} role="region" aria-label="可横向滚动的问题表格">
          <Table className={clsx(workspaceStyles.workspaceIndexTable, workspaceStyles.isIssues)}>
            <TableHeader className={styles.tableHeader}>
              <TableRow>
                <TableHead>严重程度</TableHead>
                <TableHead>问题</TableHead>
                <TableHead>环境</TableHead>
                <TableHead>执行次数</TableHead>
                <TableHead>最近出现 ↓</TableHead>
                <TableHead>状态</TableHead>
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
                      {issue.latestOccurrence?.snapshot.name ?? '手动创建'} ·{' '}
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
                    title={new Date(issue.lastSeen ?? issue.createdAt).toLocaleString('zh-CN')}
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
