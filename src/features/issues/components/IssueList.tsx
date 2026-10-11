'use client';

import { useDeferredValue, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import { fetchJson } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { issueStatuses, issueCategories, issueSeverities, type IssuePage } from '../types';
import { IssueEditor, options } from './IssueEditor';

export function IssueList() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const search = useDeferredValue(q);
  const [status, setStatus] = useState('all');
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useSWRInfinite<IssuePage>(
    (index, previous) => {
      if (index && !previous?.nextCursor) return null;
      const params = new URLSearchParams({ q: search, status });

      if (index) params.set('cursor', previous!.nextCursor!);

      return `/api/issues?${params}`;
    },
    fetchJson,
    { refreshInterval: 30000 },
  );
  const items = data?.flatMap((page) => page.issues) ?? [];

  return (
    <section className="mx-auto max-w-6xl p-6 md:p-10" aria-label="问题追踪">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">问题追踪</h1>
          <p className="mt-2 text-sm text-page-muted">从测试证据确认问题，跟进处理并验证修复。</p>
        </div>
        <Button className="ws-button primary" onClick={() => setCreating(true)}>
          新建问题
        </Button>
      </div>
      <div className="my-6 flex flex-wrap gap-3">
        <input
          aria-label="搜索问题"
          className="ws-input max-w-sm"
          placeholder="搜索标题或描述"
          maxLength={200}
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <Select
          aria-label="筛选问题状态"
          className="ws-input w-auto"
          value={status}
          onValueChange={setStatus}
          items={[{ value: 'all', label: '全部状态' }, ...options(issueStatuses)]}
        />
        <Button className="ws-button" onClick={() => void mutate()}>
          刷新
        </Button>
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
        <div className="overflow-x-auto rounded-lg border border-page-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-page text-page-muted">
              <tr>
                <th className="p-4">问题</th>
                <th className="p-4">状态</th>
                <th className="p-4">分类</th>
                <th className="p-4">严重程度</th>
                <th className="p-4">最近更新</th>
              </tr>
            </thead>
            <tbody>
              {items.map((issue) => (
                <tr key={issue.id} className="border-t border-page-line">
                  <td className="p-4">
                    <Link className="font-medium text-brand" href={`/issues/${issue.id}`}>
                      {issue.title}
                    </Link>
                  </td>
                  <td className="p-4">{issueStatuses[issue.status]}</td>
                  <td className="p-4">{issueCategories[issue.category]}</td>
                  <td className="p-4">{issueSeverities[issue.severity]}</td>
                  <td className="p-4 whitespace-nowrap">
                    {new Date(issue.updatedAt).toLocaleString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data?.at(-1)?.nextCursor && (
        <Button
          className="ws-button mt-4"
          disabled={isValidating}
          onClick={() => void setSize(size + 1)}
        >
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
