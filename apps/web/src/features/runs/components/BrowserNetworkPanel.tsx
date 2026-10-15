'use client';

import { useTranslations } from 'next-intl';

import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import type { BrowserLog } from '@testdog/contracts/runs/types';
import styles from './BrowserLogPanel.module.css';

export function requestUrl(log: BrowserLog, unknownName = '—') {
  try {
    const url = new URL(log.url || '');

    return {
      name: url.pathname.split('/').filter(Boolean).at(-1) || url.hostname,
      host: url.host,
      url,
    };
  } catch {
    return { name: log.url || unknownName, host: '', url: undefined };
  }
}

export function requestFailed(log: BrowserLog) {
  return !!log.failure || (log.status ?? 0) >= 400;
}

export function NetworkEntries({ logs }: { logs: BrowserLog[] }) {
  const t = useTranslations('runs');
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
        <table className={styles.requestTable} aria-label={t('networkRequests')}>
          <thead>
            <tr>
              <th scope="col">{t('nameLabel')}</th>
              <th scope="col">{t('methodLabel')}</th>
              {heading(t('statusLabel'), 'status')}
              <th scope="col">{t('typeLabel')}</th>
              {heading(t('timeLabel'), 'durationMs')}
              {heading(t('waterfall'), 'elapsedMs')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((log) => {
              const url = requestUrl(log, t('unknownRequest'));

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
                      aria-label={t('viewRequest', {
                        method: log.method || '—',
                        url: log.url || url.name,
                      })}
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
                      title={t('requestTiming', {
                        start: (log.elapsedMs / 1000).toFixed(2),
                        duration:
                          log.durationMs === undefined ? t('notCaptured') : `${log.durationMs} ms`,
                      })}
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
  const t = useTranslations('runs');

  return (
    <section className={styles.detailSection}>
      <h3>
        {label} <span className={styles.muted}>({Object.keys(values || {}).length})</span>
      </h3>
      {values && Object.keys(values).length ? (
        <Fields values={Object.entries(values)} />
      ) : (
        <p className={styles.detailEmpty}>{t('noHeaders')}</p>
      )}
    </section>
  );
}

function RequestDetails({ log, close }: { log: BrowserLog; close: () => void }) {
  const t = useTranslations('runs');
  const [copyStatus, setCopyStatus] = useState('');
  const url = requestUrl(log, t('unknownRequest'));

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(log.url || '');
      setCopyStatus(t('urlCopied'));
    } catch {
      setCopyStatus(t('copyUrlFailed'));
    }
  }

  return (
    <aside className={styles.requestDetails} aria-label={t('requestDetails')}>
      <div className={styles.detailTitle}>
        <span title={log.url}>{url.name}</span>
        <Button variant="ghost" size="icon-xs" aria-label={t('closeRequest')} onClick={close}>
          ×
        </Button>
      </div>
      <Tabs.Root defaultValue="headers" className={styles.detailTabs}>
        <Tabs.List className={styles.tabList} aria-label={t('requestDetailView')}>
          {[
            ['headers', t('headersLabel')],
            ['query', t('queryLabel')],
            ['timing', t('timingLabel')],
          ].map(([value, label]) => (
            <Tabs.Tab key={value} value={value} className={styles.tab}>
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="headers" className={styles.detailContent}>
          <section className={styles.detailSection}>
            <div className={styles.sectionHeading}>
              <h3>{t('generalLabel')}</h3>
              <Button variant="ghost" size="xs" disabled={!log.url} onClick={() => void copyUrl()}>
                {t('copyUrl')}
              </Button>
            </div>
            {copyStatus && (
              <p role="status" className={styles.detailEmpty}>
                {copyStatus}
              </p>
            )}
            <Fields
              values={[
                [t('requestUrlLabel'), log.url],
                [t('requestMethodLabel'), log.method],
                [t('statusCodeLabel'), log.failure ? `FAILED · ${log.failure}` : log.status],
                [t('resourceTypeLabel'), log.resourceType],
                [t('pageLabel'), log.pageId],
                [t('pageUrlLabel'), log.pageUrl],
              ]}
            />
          </section>
          <Headers label={t('responseHeadersLabel')} values={log.responseHeaders} />
          <Headers label={t('requestHeadersLabel')} values={log.requestHeaders} />
        </Tabs.Panel>
        <Tabs.Panel value="query" className={styles.detailContent}>
          <section className={styles.detailSection}>
            <h3>{t('queryParameters')}</h3>
            {url.url?.search ? (
              <Fields values={Array.from(url.url.searchParams.entries())} />
            ) : (
              <p className={styles.detailEmpty}>{t('noQuery')}</p>
            )}
          </section>
        </Tabs.Panel>
        <Tabs.Panel value="timing" className={styles.detailContent}>
          <section className={styles.detailSection}>
            <h3>{t('timingLabel')}</h3>
            <Fields
              values={[
                [t('elapsed'), `${(log.elapsedMs / 1000).toFixed(3)} s`],
                [
                  t('requestDuration'),
                  log.durationMs === undefined ? t('notCaptured') : `${log.durationMs} ms`,
                ],
                [t('recordedAt'), log.at],
              ]}
            />
          </section>
        </Tabs.Panel>
      </Tabs.Root>
    </aside>
  );
}
