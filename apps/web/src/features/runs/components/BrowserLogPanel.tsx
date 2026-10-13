'use client';

import styles from './BrowserLogPanel.module.css';

import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/client/api';
import { Button } from '@/components/ui/Button';
import type { BrowserLog, BrowserLogPage } from '@testdog/contracts/runs/types';

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
  const data = useSWR<BrowserLogPage>(
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
      <div className={styles.toolbar}>
        <Input
          aria-label="搜索浏览器记录"
          className={styles.input}
          placeholder="搜索内容、URL、状态码…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select
          aria-label="记录范围"
          className={styles.select}
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
        <label className={styles.field}>
          <Checkbox
            checked={errors}
            onCheckedChange={(checked) => {
              setErrors(checked);
              setCursors([]);
            }}
          />
          仅错误
        </label>
        <span className={styles.label}>{visible.length} 条</span>
      </div>
      {data.error && (
        <p role="alert">
          {data.error instanceof Error ? data.error.message : '无法加载浏览器记录'}
        </p>
      )}
      {data.isLoading && <p role="status">正在加载浏览器记录…</p>}
      <div className={styles.entries}>
        {visible.map((log) => (
          <LogRow key={log.id} log={log} />
        ))}
        {!visible.length && (
          <p className={styles.description}>
            没有符合条件的记录。旧执行记录不包含浏览器日志，请重新录制或重放。
          </p>
        )}
      </div>
      {runId && (
        <div className={styles.pagination}>
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
      <p className={styles.privacyHint}>每次执行最多采集 2000 条浏览器记录；敏感请求头已隐藏。</p>
    </section>
  );
}

export function LogRow({ log }: { log: BrowserLog }) {
  const [open, setOpen] = useState(false);

  return (
    <details className={styles.details} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className={styles.summary}>
        <span className={styles.timestamp}>
          {(log.elapsedMs / 1000).toFixed(2)}s · {log.pageId}
        </span>
        {log.kind === 'console' ? (
          <span className={log.level === 'error' ? styles.error : ''}>
            [{log.level}] {log.message}
          </span>
        ) : (
          <span className={log.failure || (log.status || 0) >= 400 ? styles.error : ''}>
            {log.method} {log.status ?? (log.failure ? 'FAILED' : '—')} {log.url} ·{' '}
            {log.durationMs ?? 0}ms
          </span>
        )}
      </summary>
      {open && <pre className={styles.code}>{JSON.stringify(log, null, 2)}</pre>}
    </details>
  );
}
