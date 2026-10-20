'use client';

import { useState, useContext } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { api, fetchJson } from '@/client/api';
import { WorkspaceRealtimeContext } from '@/client/WorkspaceRealtimeContext';
import { retryVisibleRequest } from '@/client/swr';
import { Button } from '@/components/ui/Button';
import { statusStyles } from '@/components/ui/statusStyles';
import { ErrorState } from '@/components/shared/ErrorState';
import { BackLink } from '@/components/shared/BackLink';
import { LoadingState } from '@/components/shared/LoadingState';
import type { SuiteRunDetail } from '@testdog/contracts/suites/types';
import styles from './Suites.module.css';

export function SuiteRunView({ id }: { id: string }) {
  const t = useTranslations('suites');
  const status = useTranslations('workspace');
  const connected = useContext(WorkspaceRealtimeContext);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const {
    data,
    error: loadError,
    mutate,
  } = useSWR<SuiteRunDetail>(`/api/suite-runs/${id}`, fetchJson, {
    refreshInterval: (current) =>
      !connected && current && ['queued', 'running'].includes(current.status) ? 5000 : 0,
    onErrorRetry: retryVisibleRequest,
  });
  const active = !data || data.status === 'queued' || data.status === 'running';

  async function cancel() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await api.delete(`/api/suite-runs/${id}`);
      await mutate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('stopFailed'));
    } finally {
      setPending(false);
    }
  }

  if (loadError)
    return (
      <ErrorState
        message={loadError instanceof Error ? loadError.message : t('loadFailed')}
        retry={() => mutate()}
      />
    );
  if (!data) return <LoadingState />;
  const done = data.counts.passed + data.counts.failed + data.counts.cancelled;

  return (
    <div className={styles.page}>
      <BackLink href="/runs">{t('backToExecution')}</BackLink>
      <header className={styles.header}>
        <h1 className={styles.title}>{data.name}</h1>
        <div className={styles.toolbar}>
          {data.suiteId && (
            <Link href={`/cases/folders/${data.suiteId}`} className={styles.back}>
              {t('viewSuite')}
            </Link>
          )}
          <span className={statusStyles(data.status)}>{status(data.status)}</span>
          {active && (
            <Button disabled={pending || data.cancelRequested} onClick={cancel}>
              {t(pending || data.cancelRequested ? 'stopping' : 'stop')}
            </Button>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <section className={styles.section} aria-label={t('progress')}>
        <div className={styles.toolbar}>
          <span>{t('completed', { done, total: data.total })}</span>
          <span>{t('passedCount', { count: data.counts.passed })}</span>
          <span>{t('failedCount', { count: data.counts.failed })}</span>
        </div>
        <progress
          className={styles.progress}
          value={done}
          max={data.total}
          aria-label={t('progress')}
        />
      </section>
      <ul className={styles.list}>
        {data.runs.map((run) => (
          <li key={run.id} className={styles.item}>
            <div className={styles.identity}>
              <Link className={styles.name} href={`/runs/${run.id}`}>
                {run.name}
              </Link>
              {run.error && <span className={styles.error}>{run.error}</span>}
            </div>
            <span className={statusStyles(run.status)}>{status(run.status)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
