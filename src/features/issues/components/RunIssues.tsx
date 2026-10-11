'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { fetchJson } from '@/client/api';
import { issueStatuses, type IssuePage } from '../types';

export function RunIssues({ runId }: { runId: string }) {
  const { data } = useSWR<IssuePage>(`/api/issues?runId=${runId}`, fetchJson, {
    refreshInterval: 5000,
  });

  if (!data?.issues.length) return null;

  return (
    <aside aria-label="执行关联问题" className="studio-alert flex flex-wrap items-center gap-3">
      <span>本次执行发现的问题：</span>
      {data.issues.map((issue) => (
        <Link key={issue.id} className="text-brand underline" href={`/issues/${issue.id}`}>
          {issue.title} · {issueStatuses[issue.status]}
        </Link>
      ))}
    </aside>
  );
}
