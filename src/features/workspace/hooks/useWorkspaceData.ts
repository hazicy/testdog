'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import type { TestCase } from '@/features/test-cases/types';
import type { RunSummary } from '@/features/runs/types';
import type { WorkspaceStats } from '@/server/workspace/queries';
import { fetchJson } from '@/client/api';
import { useRealtime } from '@/client/useRealtime';
import { retryVisibleRequest } from '@/client/swr';

export function useWorkspaceData(isTests: boolean) {
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
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setCursors([]);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  const isVisible = useCallback(
    () => document.visibilityState === 'visible' && !connection.current,
    [],
  );
  const options = {
    refreshInterval: connected ? 0 : 10000,
    isVisible,
    errorRetryInterval: 10000,
    onErrorRetry: retryVisibleRequest,
    onSuccess: () => setError(''),
  };
  const stats = useSWR<WorkspaceStats>('/api/workspace/stats', fetchJson, options);
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (filter !== 'all') params.set('status', filter);
  if (cursors.length) params.set('cursor', cursors.at(-1)!);
  const suffix = params.size ? `?${params}` : '';
  const list = useSWR<{
    tests?: TestCase[];
    runs?: RunSummary[];
    latestRuns?: RunSummary[];
    nextCursor?: string | null;
  }>(`${isTests ? '/api/tests' : '/api/runs'}${suffix}`, fetchJson, options);
  const counts = stats.data?.counts ?? {
    queued: 0,
    preparing: 0,
    running: 0,
    finalizing: 0,
    passed: 0,
    failed: 0,
    cancelled: 0,
  };
  const latestRuns = useMemo(
    () =>
      new Map(
        (list.data?.latestRuns ?? []).filter((run) => run.testId).map((run) => [run.testId!, run]),
      ),
    [list.data],
  );
  const running = counts.running + counts.queued + counts.preparing + counts.finalizing > 0;
  const refresh = useCallback(async () => {
    await Promise.all([list.mutate(), stats.mutate()]);
    setError('');
  }, [list.mutate, stats.mutate]);
  useEffect(() => {
    realtimeRefresh.current = refresh;
  }, [refresh]);
  useEffect(() => {
    connection.current = connected;
  }, [connected]);
  const loadError = list.error || stats.error;
  return {
    tests: list.data?.tests ?? [],
    runs: list.data?.runs ?? [],
    testCount: stats.data?.testCount ?? 0,
    runCount: stats.data?.runCount ?? 0,
    loading: list.isLoading || stats.isLoading,
    error:
      error || (loadError instanceof Error ? loadError.message : loadError ? '无法加载工作区' : ''),
    setError,
    counts,
    latestRuns,
    running,
    connected,
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
    hasNext: !!list.data?.nextCursor,
    nextPage: () => {
      if (list.data?.nextCursor) setCursors([...cursors, list.data.nextCursor]);
    },
    previousPage: () => setCursors(cursors.slice(0, -1)),
  };
}
