'use client';

import { useTranslations } from 'next-intl';

import styles from './BrowserLogPanel.module.css';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useContext } from 'react';
import { RunRealtimeContext } from '../hooks/RunRealtimeContext';
import { fetchJson } from '@/client/api';
import { useDebouncedValue } from '@/client/useDebouncedValue';
import { Button } from '@/components/ui/Button';
import { Icon } from '@iconify/react/offline';
import searchIcon from '@iconify-icons/lucide/search';
import chevronRightIcon from '@iconify-icons/lucide/chevron-right';
import { useLogVirtualizer } from '../hooks/useLogVirtualizer';
import { NetworkEntries } from './BrowserNetworkPanel';
import type { BrowserLog, BrowserLogList } from '@testdog/contracts/runs/types';

const consoleFilters = [
  ['all', 'All'],
  ['error', 'Error'],
  ['warning', 'Warning'],
  ['info', 'Info'],
  ['debug', 'Verbose'],
];
const networkFilters = [
  ['all', 'All'],
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
  const connected = useContext(RunRealtimeContext);
  const t = useTranslations('runs');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [filter, setFilter] = useState('all');
  const search = useDebouncedValue(query);
  const params = new URLSearchParams({ kind, q: search });

  if (scope === 'step' && stepId) params.set('stepId', stepId);
  if (scope === 'time' && elapsedMs !== undefined) params.set('untilMs', String(elapsedMs));
  const logKey = `${runId}?${params}`;
  const data = useSWR<BrowserLogList>(
    enabled && runId ? `/api/runs/${runId}/logs?${params}` : null,
    fetchJson,
    { refreshInterval: active && !connected ? 5000 : 0 },
  );
  const mutate = data.mutate;

  useEffect(() => {
    if (enabled && runId && !connected) void mutate();
  }, [revision, runId, mutate, enabled, connected]);
  const records = data.data?.logs ?? [];
  const visible = records.filter((log) => matchesFilter(log, filter));
  const filters = kind === 'console' ? consoleFilters : networkFilters;

  return (
    <section
      className={styles.panel}
      aria-label={kind === 'console' ? t('consoleLogs') : t('networkLogs')}
    >
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Icon icon={searchIcon} width="14" aria-hidden="true" />
          <Input
            aria-label={t('searchBrowserLogs')}
            className={styles.input}
            placeholder={kind === 'console' ? t('filterConsole') : t('filterNetwork')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('clearSearch')}
              onClick={() => setQuery('')}
            >
              ×
            </Button>
          )}
        </div>
        <Select
          aria-label={t('logScope')}
          className={styles.select}
          value={scope}
          onValueChange={(value) => {
            setScope(value);
          }}
          items={[
            { value: 'all', label: t('allLogs') },
            { value: 'step', label: t('currentStep'), disabled: !stepId },
            { value: 'time', label: t('untilPlayback'), disabled: elapsedMs == null },
          ]}
        />
      </div>
      <div
        className={styles.filterbar}
        role="group"
        aria-label={kind === 'console' ? t('logLevel') : t('resourceType')}
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
            {value === 'all' ? t('all') : label}
            {kind === 'console' && (
              <span>{records.filter((log) => matchesFilter(log, value)).length}</span>
            )}
          </Button>
        ))}
      </div>
      {data.error && (
        <div role="alert" className={styles.loadError}>
          <span>{data.error instanceof Error ? data.error.message : t('logsLoadFailed')}</span>
          <Button size="xs" onClick={() => void mutate()}>
            {t('retry')}
          </Button>
        </div>
      )}
      <div className={styles.body}>
        {data.isLoading ? (
          <div className={styles.empty} role="status">
            {t('loadingLogs')}
          </div>
        ) : !visible.length ? (
          <div className={styles.empty}>
            <strong>
              {query || filter !== 'all' || scope !== 'all'
                ? t('noMatches')
                : kind === 'console'
                  ? t('noConsoleLogs')
                  : t('noRequests')}
            </strong>
          </div>
        ) : kind === 'network' ? (
          <NetworkEntries key={`${logKey}:${filter}`} logs={visible} />
        ) : (
          <ConsoleEntries key={`${logKey}:${filter}`} logs={visible} />
        )}
      </div>
    </section>
  );
}

function ConsoleEntries({ logs }: { logs: BrowserLog[] }) {
  const { scrollRef, indexes, paddingStart, paddingEnd, measureElement } = useLogVirtualizer(logs);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  return (
    <div ref={scrollRef} className={styles.consoleEntries}>
      <div style={{ height: `${paddingStart}rem` }} aria-hidden="true" />
      {indexes.map((index) => (
        <div key={logs[index].id} data-index={index} ref={measureElement}>
          <LogRow
            log={logs[index]}
            open={expanded.has(logs[index].id)}
            onOpenChange={(open) => {
              setExpanded((current) => {
                const next = new Set(current);

                if (open) next.add(logs[index].id);
                else next.delete(logs[index].id);

                return next;
              });
            }}
          />
        </div>
      ))}
      <div style={{ height: `${paddingEnd}rem` }} aria-hidden="true" />
    </div>
  );
}

export function LogRow({
  log,
  open,
  onOpenChange,
}: {
  log: BrowserLog;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('runs');
  const level = ['warn', 'warning'].includes(log.level || '') ? 'warning' : log.level || 'log';

  return (
    <details
      className={styles.consoleRow}
      data-level={level}
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;

        if (next !== open) onOpenChange(next);
      }}
    >
      <summary className={styles.consoleSummary}>
        <Icon icon={chevronRightIcon} width="12" aria-hidden="true" className={styles.expandIcon} />
        <span className={styles.timestamp}>{(log.elapsedMs / 1000).toFixed(2)}s</span>
        <span className={styles.level} title={level}>
          {level === 'error' ? '×' : level === 'warning' ? '!' : '·'}
        </span>
        <span className={styles.message}>{log.message || t('emptyLog')}</span>
        <span className={styles.source} title={log.pageUrl}>
          {log.pageId}
        </span>
      </summary>
      {open && (
        <div className={styles.consoleDetail}>
          <pre>{log.message || t('emptyLog')}</pre>
          <dl>
            <dt>{t('levelLabel')}</dt>
            <dd>{log.level || 'log'}</dd>
            <dt>{t('pageUrlLabel')}</dt>
            <dd>{log.pageUrl || '—'}</dd>
            <dt>{t('stepLabel')}</dt>
            <dd>{log.stepId || '—'}</dd>
            <dt>{t('recordedAt')}</dt>
            <dd>{log.at}</dd>
          </dl>
        </div>
      )}
    </details>
  );
}
