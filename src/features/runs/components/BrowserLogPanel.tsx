'use client';

import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/client/api';
import { Button } from '@/components/ui/Button';
import type { BrowserLog } from '@/features/runs/types';

export function BrowserLogPanel({
  runId,
  revision,
  active,
  kind,
  elapsedMs,
  stepId,
  enabled = true,
}: {
  runId: string;
  enabled?: boolean;
  revision?: number;
  active?: boolean;
  kind: BrowserLog['kind'];
  elapsedMs?: number;
  stepId?: string;
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [errors, setErrors] = useState(false);
  const [search, setSearch] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setCursors([]);
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);
  const params = new URLSearchParams({ kind, q: search, errors: String(errors) });

  if (scope === 'step' && stepId) params.set('stepId', stepId);
  if (scope === 'time' && elapsedMs !== undefined) params.set('untilMs', String(elapsedMs));
  if (cursors.length) params.set('cursor', cursors.at(-1)!);
  const data = useSWR<{ logs: BrowserLog[]; nextCursor: string | null }>(
    enabled && runId ? `/api/runs/${runId}/logs?${params}` : null,
    fetchJson,
    { refreshInterval: active ? 5000 : 0 },
  );
  const mutate = data.mutate;

  useEffect(() => {
    if (enabled && runId) void mutate();
  }, [revision, runId, mutate, enabled]);
  const visible = data.data?.logs ?? [];

  return (
    <section aria-label={kind === 'console' ? 'Console 记录' : 'Network 记录'}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          aria-label="搜索浏览器记录"
          className="ws-input max-w-xs"
          placeholder="搜索内容、URL、状态码…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select
          aria-label="记录范围"
          className="ws-input w-auto"
          value={scope}
          onValueChange={(value) => {
            setScope(value);
            setCursors([]);
          }}
          items={[
            { value: 'all', label: '全部记录' },
            { value: 'step', label: '当前步骤', disabled: !stepId },
            { value: 'time', label: '截至回放时间', disabled: elapsedMs == null },
          ]}
        />
        <label className="flex gap-2 text-xs">
          <Checkbox
            checked={errors}
            onCheckedChange={(checked) => {
              setErrors(checked);
              setCursors([]);
            }}
          />
          仅错误
        </label>
        <span className="text-xs text-page-muted">{visible.length} 条</span>
      </div>
      {data.error && (
        <p role="alert">
          {data.error instanceof Error ? data.error.message : '无法加载浏览器记录'}
        </p>
      )}
      {data.isLoading && <p role="status">正在加载浏览器记录…</p>}
      <div className="max-h-96 overflow-auto font-mono text-xs">
        {visible.map((log) => (
          <LogRow key={log.id} log={log} />
        ))}
        {!visible.length && (
          <p className="py-5 text-page-muted">
            没有符合条件的记录。旧执行记录不包含浏览器日志，请重新录制或重放。
          </p>
        )}
      </div>
      {runId && (
        <div className="mt-3 flex items-center gap-4 text-xs">
          <Button
            disabled={!cursors.length || data.isLoading}
            onClick={() => setCursors(cursors.slice(0, -1))}
          >
            上一页
          </Button>
          <span>第 {cursors.length + 1} 页</span>
          <Button
            disabled={!data.data?.nextCursor || data.isLoading}
            onClick={() => {
              if (data.data?.nextCursor) setCursors([...cursors, data.data.nextCursor]);
            }}
          >
            下一页
          </Button>
        </div>
      )}
      <p className="mt-3 text-xs text-page-muted">
        每次执行最多采集 2000 条浏览器记录；敏感请求头已隐藏。
      </p>
    </section>
  );
}

export function LogRow({ log }: { log: BrowserLog }) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className="border-b border-page-line py-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer break-all leading-6">
        <span className="mr-3 text-page-muted">
          {(log.elapsedMs / 1000).toFixed(2)}s · {log.pageId}
        </span>
        {log.kind === 'console' ? (
          <span className={log.level === 'error' ? 'text-error-ink' : ''}>
            [{log.level}] {log.message}
          </span>
        ) : (
          <span className={log.failure || (log.status || 0) >= 400 ? 'text-error-ink' : ''}>
            {log.method} {log.status ?? (log.failure ? 'FAILED' : '—')} {log.url} ·{' '}
            {log.durationMs ?? 0}ms
          </span>
        )}
      </summary>
      {open && (
        <pre className="mt-2 whitespace-pre-wrap break-all bg-page p-3 leading-6">
          {JSON.stringify(log, null, 2)}
        </pre>
      )}
    </details>
  );
}
