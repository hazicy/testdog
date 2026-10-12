'use client';

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';

import { Input } from '@/components/ui/Input';
import { useDeferredValue, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import { fetchJson } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { issueStatuses, issueSeverities, type IssuePage } from '@testdog/contracts/issues/types';
import { IssueEditor, options } from '@/features/issues/components/IssueEditor';
import { environmentLabel, relativeTime } from '@/features/issues/presentation';
import { Icon } from '@iconify/react/offline';
import searchIcon from '@iconify-icons/lucide/search';
import plusIcon from '@iconify-icons/lucide/plus';
import bugIcon from '@iconify-icons/lucide/bug';
import '@/features/workspace/components/workspace-index.css';

export function IssueList() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const search = useDeferredValue(q);
  const [status, setStatus] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [days, setDays] = useState('all');
  const [sort, setSort] = useState('last_seen');
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading, isValidating, size, setSize } = useSWRInfinite<IssuePage>(
    (index, previous) => {
      if (index && !previous?.nextCursor) return null;
      const params = new URLSearchParams({ q: search, status, platform, sort });

      if (days !== 'all') params.set('days', days);

      if (index) params.set('cursor', previous!.nextCursor!);

      return `/api/issues?${params}`;
    },
    fetchJson,
    { refreshInterval: 30000 },
  );
  const items = data?.flatMap((page) => page.issues) ?? [];

  return (
    <section className="workspace-index mx-auto max-w-[1500px]" aria-label="问题追踪">
      <h1 className="sr-only">问题追踪</h1>
      <div className="workspace-index-toolbar issue-index-toolbar">
        <div className="workspace-index-search relative">
          <Icon
            icon={searchIcon}
            width="16"
            className="absolute top-2.5 left-3 text-text-subtle"
            aria-hidden="true"
          />
          <Input
            aria-label="搜索问题"
            className="pl-9"
            placeholder="搜索问题…"
            maxLength={200}
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <div className="workspace-index-filter flex flex-wrap items-center gap-2">
          <Select
            aria-label="筛选问题状态"
            className="w-auto"
            value={status}
            onValueChange={setStatus}
            items={[{ value: 'all', label: '全部状态' }, ...options(issueStatuses)]}
          />
          <Select
            aria-label="筛选环境"
            className="w-auto"
            value={platform}
            onValueChange={setPlatform}
            items={[
              { value: 'all', label: '全部环境' },
              { value: 'web', label: 'Web' },
              { value: 'android', label: 'Android' },
              { value: 'ios', label: 'iOS' },
            ]}
          />
          <Select
            aria-label="问题排序"
            className="w-auto"
            value={sort}
            onValueChange={setSort}
            items={[
              { value: 'last_seen', label: '最近出现 ↓' },
              { value: 'updated', label: '最近更新 ↓' },
            ]}
          />
          <Select
            aria-label="筛选日期"
            className="w-auto"
            value={days}
            onValueChange={setDays}
            items={[
              { value: 'all', label: '全部日期' },
              { value: '1', label: '最近 24 小时' },
              { value: '7', label: '最近 7 天' },
              { value: '30', label: '最近 30 天' },
            ]}
          />
        </div>
        <div className="workspace-index-toolbar-actions">
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Icon icon={plusIcon} width="16" aria-hidden="true" />
            新建问题
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-error-ink">
          {error.message}
        </p>
      )}
      {isLoading ? (
        <p role="status" className="p-16 text-center text-sm text-text-subtle">
          正在加载问题…
        </p>
      ) : !items.length ? (
        <div className="workspace-index-empty">
          <Icon icon={bugIcon} width="28" className="mb-5 text-page-muted" aria-hidden="true" />
          <p>
            {search || status !== 'all'
              ? '没有匹配的问题。'
              : '暂无问题。可从执行记录的失败节点创建问题。'}
          </p>
          <Link href="/runs" className="mt-4 inline-block text-brand">
            查看执行记录
          </Link>
        </div>
      ) : (
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="可横向滚动的问题表格"
        >
          <Table className="workspace-index-table is-issues">
            <TableHeader className="bg-transparent">
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
                      className="workspace-index-tag text-error-ink"
                      title={issueSeverities[issue.severity]}
                    >
                      {issue.category === 'product' ? 'BUG' : issue.category.toUpperCase()}
                    </span>
                    <span className="mt-1 block text-xs text-page-muted">
                      {issueSeverities[issue.severity]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      className="workspace-index-name font-medium hover:text-brand"
                      href={`/issues/${issue.id}`}
                    >
                      {issue.title}
                    </Link>
                    <p className="workspace-index-description">
                      {issue.latestOccurrence?.snapshot.name ?? '手动创建'} ·{' '}
                      {issue.latestOccurrence?.snapshot.target?.platform ?? 'Web'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span className="workspace-index-tag">
                      {environmentLabel(issue.latestOccurrence)}
                    </span>
                  </TableCell>
                  <TableCell>{issue.runCount ?? 0}</TableCell>
                  <TableCell
                    className="workspace-index-time whitespace-nowrap"
                    title={new Date(issue.lastSeen ?? issue.createdAt).toLocaleString('zh-CN')}
                  >
                    {relativeTime(issue.lastSeen ?? issue.createdAt)}
                  </TableCell>
                  <TableCell className="text-page-muted">{issueStatuses[issue.status]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="workspace-index-footer">
        <span>{isLoading ? '—' : items.length} 条记录</span>
        {data?.at(-1)?.nextCursor && (
          <div className="workspace-index-pagination">
            <Button
              variant="ghost"
              size="sm"
              disabled={isValidating}
              onClick={() => void setSize(size + 1)}
            >
              加载更多
            </Button>
          </div>
        )}
      </div>
      {creating && (
        <IssueEditor
          onDismiss={() => setCreating(false)}
          onSaved={(issue) => router.push(`/issues/${issue.id}`)}
        />
      )}
    </section>
  );
}
