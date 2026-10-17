'use client';

import { useTranslations } from 'next-intl';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import type { RunSummary } from '@testdog/contracts/runs/types';
import { emptyRunCounts, type WorkspaceStats } from '@testdog/contracts/workspace/types';
import { fetchJson } from '@/client/api';
import { useDebouncedValue } from '@/client/useDebouncedValue';
import { useCursorPagination } from '@/client/useCursorPagination';
import { WorkspaceRealtimeContext } from '@/client/WorkspaceRealtimeContext';
import { useRealtime } from '@/client/useRealtime';
import { retryVisibleRequest } from '@/client/swr';

type ListPage = {
  tests?: TestCase[];
  runs?: RunSummary[];
  latestRuns?: RunSummary[];
  nextCursor?: string | null;
};

const emptyCounts = emptyRunCounts();

export function useWorkspaceData(isTests: boolean, folderId?: string | null) {
  const t = useTranslations('workspace');
  const [error, setError] = useState('');
  const [{ q: query, status: filter }, setFilters] = useQueryStates({
    q: parseAsString.withDefault(''),
    status: parseAsStringLiteral([
      'all',
      'passed',
      'failed',
      'queued',
      'preparing',
      'finalizing',
      'running',
      'cancelled',
      ...(isTests ? ['none'] : []),
    ]).withDefault('all'),
  });
  const search = useDebouncedValue(query.trim());
  const { cursors, previousPage, nextPage } = useCursorPagination(
    JSON.stringify([isTests, search, filter, folderId]),
  );
  const connection = useRef(false);
  const realtimeRefresh = useRef<() => Promise<void>>(async () => {});
  const sharedConnection = useContext(WorkspaceRealtimeContext);
  const ownConnection = useRealtime(sharedConnection === null ? '/api/events' : null, () => {
    void realtimeRefresh.current();
  });
  const connected = sharedConnection ?? ownConnection;

  const isVisible = useCallback(
    () => document.visibilityState === 'visible' && !connection.current,
    [],
  );
  const options = {
    refreshInterval: connected ? 0 : 10000,
    isVisible,
    errorRetryInterval: 10000,
    onErrorRetry: retryVisibleRequest,
  };
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    mutate: mutateStats,
  } = useSWR<WorkspaceStats>('/api/workspace/stats', fetchJson, options);
  const params = new URLSearchParams();

  if (isTests && folderId !== undefined) params.set('folder', folderId ?? 'root');
  if (search) params.set('q', search);
  if (filter !== 'all') params.set('status', filter);
  if (cursors.length) params.set('cursor', cursors.at(-1)!);
  const suffix = params.size ? `?${params}` : '';
  const {
    data: page,
    isLoading: listLoading,
    error: listError,
    mutate: mutateList,
  } = useSWR<ListPage>(`${isTests ? '/api/tests' : '/api/runs'}${suffix}`, fetchJson, options);
  const counts = stats?.counts ?? emptyCounts;
  const latestRuns = useMemo(
    () =>
      new Map(
        (page?.latestRuns ?? []).filter((run) => run.testId).map((run) => [run.testId!, run]),
      ),
    [page],
  );
  const running = counts.running + counts.queued + counts.preparing + counts.finalizing > 0;
  const revalidate = useCallback(async () => {
    await Promise.all([mutateList(), mutateStats()]);
  }, [mutateList, mutateStats]);
  const refresh = useCallback(async () => {
    await revalidate();
    setError('');
  }, [revalidate]);

  useEffect(() => {
    realtimeRefresh.current = revalidate;
  }, [revalidate]);
  useEffect(() => {
    connection.current = connected;
  }, [connected]);
  const loadError = listError || statsError;

  return {
    tests: page?.tests ?? [],
    runs: page?.runs ?? [],
    loading: listLoading || statsLoading,
    error:
      error || (loadError instanceof Error ? loadError.message : loadError ? t('loadFailed') : ''),
    setError,
    latestRuns,
    running,
    refresh,
    query,
    setQuery: (q: string) => {
      void setFilters({ q });
    },
    filter,
    setFilter: (value: string) => {
      void setFilters({ status: value as typeof filter }, { history: 'push' });
    },
    page: cursors.length + 1,
    hasPrevious: cursors.length > 0,
    hasNext: !!page?.nextCursor,
    nextPage: () => nextPage(page?.nextCursor),
    previousPage,
  };
}
