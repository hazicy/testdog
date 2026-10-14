'use client';

import styles from './BrowserLogPanel.module.css';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { Icon } from '@iconify/react/offline';
import searchIcon from '@iconify-icons/lucide/search';
import chevronRightIcon from '@iconify-icons/lucide/chevron-right';
import { NetworkEntries } from './BrowserNetworkPanel';
import type { BrowserLog, BrowserLogPage } from '@testdog/contracts/runs/types';

const consoleFilters = [
  ['all', '全部'],
  ['error', 'Error'],
  ['warning', 'Warning'],
  ['info', 'Info'],
  ['debug', 'Verbose'],
];
const networkFilters = [
  ['all', '全部'],
  ['fetch', 'Fetch/XHR'],
  ['script', 'JS'],
  ['stylesheet', 'CSS'],
  ['image', 'Img'],
  ['document', 'Doc'],
  ['other', 'Other'],
];

function matchesFilter(log: BrowserLog, filter: string) {
  if (filter === 'all') return true;
  if (log.kind === 'console') {
    const level = log.level || 'log';

    if (filter === 'warning') return ['warning', 'warn'].includes(level);
    if (filter === 'info') return ['log', 'info'].includes(level);
    if (filter === 'debug') return !['error', 'warning', 'warn', 'log', 'info'].includes(level);

    return level === filter;
  }

  if (filter === 'fetch') return ['fetch', 'xhr'].includes(log.resourceType || '');
  if (filter === 'other')
    return !['fetch', 'xhr', 'script', 'stylesheet', 'image', 'document'].includes(
      log.resourceType || '',
    );

  return log.resourceType === filter;
}

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
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<{ key: string; cursors: string[] }>({
    key: '',
    cursors: [],
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);
  const params = new URLSearchParams({ kind, q: search });

  if (scope === 'step' && stepId) params.set('stepId', stepId);
  if (scope === 'time' && elapsedMs !== undefined) params.set('untilMs', String(elapsedMs));
  const paginationKey = `${runId}?${params}`;
  const cursors = pagination.key === paginationKey ? pagination.cursors : [];

  function setCursors(next: string[]) {
    setPagination({ key: paginationKey, cursors: next });
  }

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
  const records = data.data?.logs ?? [];
  const visible = records.filter((log) => matchesFilter(log, filter));
  const filters = kind === 'console' ? consoleFilters : networkFilters;

  return (
    <section
      className={styles.panel}
      aria-label={kind === 'console' ? 'Console 记录' : 'Network 记录'}
    >
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Icon icon={searchIcon} width="14" aria-hidden="true" />
          <Input
            aria-label="搜索浏览器记录"
            className={styles.input}
            placeholder={kind === 'console' ? '过滤日志内容…' : '过滤 URL、状态码…'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="清除搜索"
              onClick={() => setQuery('')}
            >
              ×
            </Button>
          )}
        </div>
        <Select
          aria-label="记录范围"
          className={styles.select}
          value={scope}
          onValueChange={(value) => {
            setScope(value);
          }}
          items={[
            { value: 'all', label: '全部记录' },
            { value: 'step', label: '当前步骤', disabled: !stepId },
            { value: 'time', label: '截至回放时间', disabled: elapsedMs == null },
          ]}
        />
      </div>
      <div
        className={styles.filterbar}
        role="group"
        aria-label={kind === 'console' ? '本页日志级别' : '本页资源类型'}
      >
        {filters.map(([value, label]) => (
          <Button
            variant="ghost"
            size="xs"
            key={value}
            aria-pressed={filter === value}
            className={styles.filter}
            onClick={() => setFilter(value)}
          >
            {label}
            {kind === 'console' && (
              <span>{records.filter((log) => matchesFilter(log, value)).length}</span>
            )}
          </Button>
        ))}
      </div>
      {data.error && (
        <div role="alert" className={styles.loadError}>
          <span>{data.error instanceof Error ? data.error.message : '无法加载浏览器记录'}</span>
          <Button size="xs" onClick={() => void mutate()}>
            重试
          </Button>
        </div>
      )}
      <div className={styles.body}>
        {data.isLoading ? (
          <div className={styles.empty} role="status">
            正在加载浏览器记录…
          </div>
        ) : !visible.length ? (
          <div className={styles.empty}>
            <strong>
              {query || filter !== 'all' || scope !== 'all'
                ? '没有匹配的记录'
                : kind === 'console'
                  ? '暂无 Console 日志'
                  : '暂无网络请求'}
            </strong>
          </div>
        ) : kind === 'network' ? (
          <NetworkEntries logs={visible} />
        ) : (
          <div className={styles.consoleEntries}>
            {visible.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
      {(cursors.length > 0 || data.data?.nextCursor) && (
        <footer className={styles.footer}>
          <div className={styles.pagination}>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="上一页"
              disabled={!cursors.length || data.isLoading}
              onClick={() => setCursors(cursors.slice(0, -1))}
            >
              ‹
            </Button>
            <span>第 {cursors.length + 1} 页</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="下一页"
              disabled={!data.data?.nextCursor || data.isLoading}
              onClick={() => {
                if (data.data?.nextCursor) setCursors([...cursors, data.data.nextCursor]);
              }}
            >
              ›
            </Button>
          </div>
        </footer>
      )}
    </section>
  );
}

export function LogRow({ log }: { log: BrowserLog }) {
  const [open, setOpen] = useState(false);
  const level = ['warn', 'warning'].includes(log.level || '') ? 'warning' : log.level || 'log';

  return (
    <details
      className={styles.consoleRow}
      data-level={level}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className={styles.consoleSummary}>
        <Icon icon={chevronRightIcon} width="12" aria-hidden="true" className={styles.expandIcon} />
        <span className={styles.timestamp}>{(log.elapsedMs / 1000).toFixed(2)}s</span>
        <span className={styles.level} title={level}>
          {level === 'error' ? '×' : level === 'warning' ? '!' : '·'}
        </span>
        <span className={styles.message}>{log.message || '（空日志）'}</span>
        <span className={styles.source} title={log.pageUrl}>
          {log.pageId}
        </span>
      </summary>
      {open && (
        <div className={styles.consoleDetail}>
          <pre>{log.message || '（空日志）'}</pre>
          <dl>
            <dt>Level</dt>
            <dd>{log.level || 'log'}</dd>
            <dt>Page URL</dt>
            <dd>{log.pageUrl || '—'}</dd>
            <dt>Step</dt>
            <dd>{log.stepId || '—'}</dd>
            <dt>记录时间</dt>
            <dd>{log.at}</dd>
          </dl>
        </div>
      )}
    </details>
  );
}
