'use client';

import { useTranslations } from 'next-intl';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import type { RunSummary } from '@testdog/contracts/runs/types';
import { emptyRunCounts, type WorkspaceStats } from '@testdog/contracts/workspace/types';
import { fetchJson } from '@/client/api';
import { useRealtime } from '@/client/useRealtime';
import { retryVisibleRequest } from '@/client/swr';

type ListPage = {
  tests?: TestCase[];
  runs?: RunSummary[];
  latestRuns?: RunSummary[];
  nextCursor?: string | null;
};

const emptyCounts = emptyRunCounts();

export function useWorkspaceData(isTests: boolean) {
  const t = useTranslations('workspace');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [cursors, setCursors] = useState<string[]>([]);
  const connection = useRef(false);
  const realtimeRefresh = useRef<() => Promise<void>>(async () => {});
  const connected = useRealtime('/api/events', () => {
    void realtimeRefresh.current();
  });

  useEffect(() => {
    if (query.trim() === search) return;
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setCursors([]);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, search]);
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
    setQuery,
    filter,
    setFilter: (value: string) => {
      setFilter(value);
      setCursors([]);
    },
    page: cursors.length + 1,
    hasPrevious: cursors.length > 0,
    hasNext: !!page?.nextCursor,
    nextPage: () => {
      if (page?.nextCursor) setCursors([...cursors, page.nextCursor]);
    },
    previousPage: () => setCursors(cursors.slice(0, -1)),
  };
}
