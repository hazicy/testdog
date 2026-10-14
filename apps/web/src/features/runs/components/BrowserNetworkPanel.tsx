'use client';

import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import type { BrowserLog } from '@testdog/contracts/runs/types';
import styles from './BrowserLogPanel.module.css';

export function requestUrl(log: BrowserLog) {
  try {
    const url = new URL(log.url || '');

    return {
      name: url.pathname.split('/').filter(Boolean).at(-1) || url.hostname,
      host: url.host,
      url,
    };
  } catch {
    return { name: log.url || '未知请求', host: '', url: undefined };
  }
}

export function requestFailed(log: BrowserLog) {
  return !!log.failure || (log.status ?? 0) >= 400;
}

export function NetworkEntries({ logs }: { logs: BrowserLog[] }) {
  const [selectedId, setSelectedId] = useState<string>();
  const [sort, setSort] = useState<{
    key: 'elapsedMs' | 'status' | 'durationMs';
    descending: boolean;
  }>({ key: 'elapsedMs', descending: false });
  const selected = logs.find((log) => log.id === selectedId);
  const sorted = [...logs].sort(
    (a, b) => ((a[sort.key] ?? -1) - (b[sort.key] ?? -1)) * (sort.descending ? -1 : 1),
  );
  const start = Math.min(...logs.map((log) => log.elapsedMs));
  const end = Math.max(...logs.map((log) => log.elapsedMs + (log.durationMs ?? 0)));
  const span = Math.max(1, end - start);

  function sortColumn(key: typeof sort.key) {
    setSort({ key, descending: sort.key === key ? !sort.descending : false });
  }

  function heading(label: string, key: typeof sort.key) {
    return (
      <th
        scope="col"
        aria-sort={sort.key === key ? (sort.descending ? 'descending' : 'ascending') : 'none'}
      >
        <button type="button" onClick={() => sortColumn(key)}>
          {label}{' '}
          <span aria-hidden="true">{sort.key === key ? (sort.descending ? '↓' : '↑') : '↕'}</span>
        </button>
      </th>
    );
  }

  return (
    <div className={clsx(styles.networkWorkspace, selected && styles.hasSelection)}>
      <div className={styles.requestList}>
        <table className={styles.requestTable} aria-label="网络请求">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Method</th>
              {heading('Status', 'status')}
              <th scope="col">Type</th>
              {heading('Time', 'durationMs')}
              {heading('Waterfall', 'elapsedMs')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((log) => {
              const url = requestUrl(log);

              return (
                <tr
                  key={log.id}
                  data-selected={selectedId === log.id}
                  data-failed={requestFailed(log)}
                >
                  <td>
                    <button
                      className={styles.requestName}
                      type="button"
                      aria-label={`查看请求 ${log.method || '—'} ${log.url || url.name}`}
                      aria-pressed={selectedId === log.id}
                      onClick={() => setSelectedId(log.id)}
                      title={log.url}
                    >
                      <span>{url.name}</span>
                      <small>{url.host}</small>
                    </button>
                  </td>
                  <td className={styles.mono}>{log.method || '—'}</td>
                  <td>
                    <span className={styles.status} data-failed={requestFailed(log)}>
                      {log.failure ? 'FAILED' : (log.status ?? '—')}
                    </span>
                  </td>
                  <td className={styles.muted}>{log.resourceType || '—'}</td>
                  <td className={styles.numeric}>
                    {log.durationMs === undefined ? '—' : `${log.durationMs} ms`}
                  </td>
                  <td>
                    <div
                      className={styles.waterfall}
                      title={`开始 ${(log.elapsedMs / 1000).toFixed(2)} s${log.durationMs === undefined ? ' · 耗时未采集' : ` · 耗时 ${log.durationMs} ms`}`}
                    >
                      <span
                        style={{
                          left: `${((log.elapsedMs - start) / span) * 100}%`,
                          width: `${((log.durationMs ?? 0) / span) * 100}%`,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selected && (
        <RequestDetails key={selected.id} log={selected} close={() => setSelectedId(undefined)} />
      )}
    </div>
  );
}

function Fields({ values }: { values: [string, ReactNode][] }) {
  return (
    <dl className={styles.fields}>
      {values.map(([name, value], index) => (
        <div key={`${name}-${index}`}>
          <dt>{name}</dt>
          <dd>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function Headers({ label, values }: { label: string; values?: Record<string, string> }) {
  return (
    <section className={styles.detailSection}>
      <h3>
        {label} <span className={styles.muted}>({Object.keys(values || {}).length})</span>
      </h3>
      {values && Object.keys(values).length ? (
        <Fields values={Object.entries(values)} />
      ) : (
        <p className={styles.detailEmpty}>未采集到请求头信息</p>
      )}
    </section>
  );
}

function RequestDetails({ log, close }: { log: BrowserLog; close: () => void }) {
  const [copyStatus, setCopyStatus] = useState('');
  const url = requestUrl(log);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(log.url || '');
      setCopyStatus('URL 已复制');
    } catch {
      setCopyStatus('复制失败，请从下方选择 URL 复制');
    }
  }

  return (
    <aside className={styles.requestDetails} aria-label="请求详情">
      <div className={styles.detailTitle}>
        <span title={log.url}>{url.name}</span>
        <Button variant="ghost" size="icon-xs" aria-label="关闭请求详情" onClick={close}>
          ×
        </Button>
      </div>
      <Tabs.Root defaultValue="headers" className={styles.detailTabs}>
        <Tabs.List className={styles.tabList} aria-label="请求详情视图">
          {[
            ['headers', 'Headers'],
            ['query', 'Query'],
            ['timing', 'Timing'],
          ].map(([value, label]) => (
            <Tabs.Tab key={value} value={value} className={styles.tab}>
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="headers" className={styles.detailContent}>
          <section className={styles.detailSection}>
            <div className={styles.sectionHeading}>
              <h3>General</h3>
              <Button variant="ghost" size="xs" disabled={!log.url} onClick={() => void copyUrl()}>
                复制 URL
              </Button>
            </div>
            {copyStatus && (
              <p role="status" className={styles.detailEmpty}>
                {copyStatus}
              </p>
            )}
            <Fields
              values={[
                ['Request URL', log.url],
                ['Request Method', log.method],
                ['Status Code', log.failure ? `FAILED · ${log.failure}` : log.status],
                ['Resource Type', log.resourceType],
                ['Page', log.pageId],
                ['Page URL', log.pageUrl],
              ]}
            />
          </section>
          <Headers label="Response Headers" values={log.responseHeaders} />
          <Headers label="Request Headers" values={log.requestHeaders} />
        </Tabs.Panel>
        <Tabs.Panel value="query" className={styles.detailContent}>
          <section className={styles.detailSection}>
            <h3>Query String Parameters</h3>
            {url.url?.search ? (
              <Fields values={Array.from(url.url.searchParams.entries())} />
            ) : (
              <p className={styles.detailEmpty}>此请求没有查询参数</p>
            )}
          </section>
        </Tabs.Panel>
        <Tabs.Panel value="timing" className={styles.detailContent}>
          <section className={styles.detailSection}>
            <h3>Timing</h3>
            <Fields
              values={[
                ['执行起点后', `${(log.elapsedMs / 1000).toFixed(3)} s`],
                ['请求耗时', log.durationMs === undefined ? '未采集' : `${log.durationMs} ms`],
                ['记录时间', log.at],
              ]}
            />
          </section>
        </Tabs.Panel>
      </Tabs.Root>
    </aside>
  );
}
