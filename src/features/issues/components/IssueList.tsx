'use client';

import { Input } from '@/components/ui/Input';
import { useDeferredValue, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import { fetchJson } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { issueStatuses, issueSeverities, type IssuePage } from '../types';
import { IssueEditor, options } from './IssueEditor';
import { environmentLabel, relativeTime } from '../presentation';

export function IssueList() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const search = useDeferredValue(q);
  const [status, setStatus] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [days, setDays] = useState('all');
  const [sort, setSort] = useState('last_seen');
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<IssuePage>(
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
    <section className="w-full p-6 md:px-10 md:py-6" aria-label="问题追踪">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">问题追踪</h1>
          <p className="mt-2 text-sm text-page-muted">
            自动收集测试发现的问题，跟进处理并验证修复。
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          新建问题
        </Button>
      </div>
      <div className="my-6 flex flex-wrap gap-3">
        <Input
          aria-label="搜索问题"
          className="max-w-sm"
          placeholder="搜索问题…"
          maxLength={200}
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
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
        <Button onClick={() => void mutate()}>刷新</Button>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-error-ink">
          {error.message}
        </p>
      )}
      {isLoading ? (
        <p role="status">正在加载问题…</p>
      ) : !items.length ? (
        <div className="rounded-lg border border-page-line p-12 text-center">
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
        <div className="overflow-x-auto border border-page-line bg-surface-raised">
          <table className="w-full text-left text-[13px] [&_th]:text-xs [&_th]:font-normal">
            <thead className="bg-page text-page-muted">
              <tr>
                <th className="w-24 px-4 py-3">严重程度</th>
                <th className="px-4 py-3">问题</th>
                <th className="px-4 py-3">环境</th>
                <th className="px-4 py-3">执行次数</th>
                <th className="px-4 py-3">最近出现 ↓</th>
                <th className="px-4 py-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {items.map((issue) => (
                <tr key={issue.id} className="border-t border-page-line">
                  <td className="px-4 py-3">
                    <span
                      className="inline-block bg-danger px-2 py-1 text-xs font-semibold text-white"
                      title={issueSeverities[issue.severity]}
                    >
                      {issue.category === 'product' ? 'BUG' : issue.category.toUpperCase()}
                    </span>
                    <span className="mt-1 block text-xs text-page-muted">
                      {issueSeverities[issue.severity]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      className="text-[13px] leading-normal font-medium tracking-[-0.01em] hover:text-brand"
                      href={`/issues/${issue.id}`}
                    >
                      {issue.title}
                    </Link>
                    <p className="mt-1 text-xs text-page-muted">
                      {issue.latestOccurrence?.snapshot.name ?? '手动创建'} ·{' '}
                      {issue.latestOccurrence?.snapshot.target?.platform ?? 'Web'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="border border-page-line bg-page px-2 py-1 text-xs">
                      {environmentLabel(issue.latestOccurrence)}
                    </span>
                  </td>
                  <td className="px-4 py-3">{issue.runCount ?? 0}</td>
                  <td
                    className="px-4 py-3 whitespace-nowrap text-text-secondary tabular-nums"
                    title={new Date(issue.lastSeen ?? issue.createdAt).toLocaleString('zh-CN')}
                  >
                    {relativeTime(issue.lastSeen ?? issue.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-page-muted">{issueStatuses[issue.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data?.at(-1)?.nextCursor && (
        <Button className="mt-4" disabled={isValidating} onClick={() => void setSize(size + 1)}>
          加载更多
        </Button>
      )}
      {creating && (
        <IssueEditor
          onDismiss={() => setCreating(false)}
          onSaved={(issue) => router.push(`/issues/${issue.id}`)}
        />
      )}
    </section>
  );
}
