'use client';

import { useTranslations } from 'next-intl';

import { useMemo, type ReactNode } from 'react';
import {
  createColumnHelper,
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { useLogVirtualizer } from '../hooks/useLogVirtualizer';
import clsx from 'clsx';
import { useToastManager } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@base-ui/react/tabs';
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

const networkFeatures = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic },
});
const column = createColumnHelper<typeof networkFeatures, BrowserLog>();

export function NetworkEntries({ logs }: { logs: BrowserLog[] }) {
  const t = useTranslations('runs');
  const start = logs.reduce((min, log) => Math.min(min, log.elapsedMs), Infinity);
  const end = logs.reduce((max, log) => Math.max(max, log.elapsedMs + (log.durationMs ?? 0)), 0);
  const span = Math.max(1, end - start);
  const columns = useMemo(
    () =>
      column.columns([
        column.display({
          id: 'name',
          header: t('nameLabel'),
          cell: ({ row }) => {
            const log = row.original;
            const url = requestUrl(log, t('unknownRequest'));

            return (
              <button
                className={styles.requestName}
                type="button"
                aria-label={t('viewRequest', {
                  method: log.method || '—',
                  url: log.url || url.name,
                })}
                aria-pressed={row.getIsSelected()}
                onClick={() => row.toggleSelected(true)}
                title={log.url}
              >
                <span>{url.name}</span>
                <small>{url.host}</small>
              </button>
            );
          },
        }),
        column.display({
          id: 'method',
          header: t('methodLabel'),
          cell: ({ row }) => <span className={styles.mono}>{row.original.method || '—'}</span>,
        }),
        column.accessor((log) => log.status ?? -1, {
          id: 'status',
          header: t('statusLabel'),
          sortFn: 'basic',
          cell: ({ row }) => (
            <span className={styles.status} data-failed={requestFailed(row.original)}>
              {row.original.failure ? 'FAILED' : (row.original.status ?? '—')}
            </span>
          ),
        }),
        column.display({
          id: 'type',
          header: t('typeLabel'),
          cell: ({ row }) => (
            <span className={styles.muted}>{row.original.resourceType || '—'}</span>
          ),
        }),
        column.accessor((log) => log.durationMs ?? -1, {
          id: 'durationMs',
          header: t('timeLabel'),
          sortFn: 'basic',
          cell: ({ row }) => (
            <span className={styles.numeric}>
              {row.original.durationMs === undefined ? '—' : `${row.original.durationMs} ms`}
            </span>
          ),
        }),
        column.accessor('elapsedMs', {
          header: t('waterfall'),
          sortFn: 'basic',
          cell: ({ row }) => {
            const log = row.original;

            return (
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
            );
          },
        }),
      ]),
    [t, start, span],
  );
  const table = useTable({
    features: networkFeatures,
    data: logs,
    columns,
    getRowId: (log) => log.id,
    enableMultiRowSelection: false,
    enableMultiSort: false,
    enableSortingRemoval: false,
    sortDescFirst: false,
    initialState: { sorting: [{ id: 'elapsedMs', desc: false }] },
  });
  const rows = table.getRowModel().rows;
  const selected = logs.find((log) => table.state.rowSelection[log.id]);
  const { scrollRef, indexes, paddingStart, paddingEnd, measureElement } = useLogVirtualizer(rows);

  return (
    <div className={clsx(styles.networkWorkspace, selected && styles.hasSelection)}>
      <div ref={scrollRef} className={styles.requestList}>
        <table
          className={styles.requestTable}
          aria-label={t('networkRequests')}
          aria-rowcount={rows.length + 1}
        >
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sort = header.column.getIsSorted();
                  const sortable = header.column.getCanSort();
                  const direction = sort === 'desc' ? 'descending' : 'ascending';

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sortable ? (sort ? direction : 'none') : undefined}
                    >
                      {sortable ? (
                        <button type="button" onClick={header.column.getToggleSortingHandler()}>
                          <table.FlexRender header={header} />{' '}
                          <span aria-hidden="true">
                            {sort === 'desc' ? '↓' : sort === 'asc' ? '↑' : '↕'}
                          </span>
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingStart > 0 && (
              <tr aria-hidden="true">
                <td
                  colSpan={columns.length}
                  className={styles.virtualSpacer}
                  style={{ height: `${paddingStart}rem` }}
                />
              </tr>
            )}
            {indexes.map((index) => {
              const row = rows[index];

              return (
                <tr
                  key={row.id}
                  ref={measureElement}
                  data-index={index}
                  aria-rowindex={index + 2}
                  data-selected={row.getIsSelected()}
                  data-failed={requestFailed(row.original)}
                >
                  {row.getAllCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cell.column.id === 'durationMs' ? styles.numeric : undefined}
                    >
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              );
            })}
            {paddingEnd > 0 && (
              <tr aria-hidden="true">
                <td
                  colSpan={columns.length}
                  className={styles.virtualSpacer}
                  style={{ height: `${paddingEnd}rem` }}
                />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selected && (
        <RequestDetails key={selected.id} log={selected} close={() => table.resetRowSelection()} />
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
  const toastManager = useToastManager();
  const url = requestUrl(log, t('unknownRequest'));

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(log.url || '');
      toastManager.add({ title: t('urlCopied'), type: 'success' });
    } catch {
      toastManager.add({ title: t('copyUrlFailed'), type: 'error' });
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
