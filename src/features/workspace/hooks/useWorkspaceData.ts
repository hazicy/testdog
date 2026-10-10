'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import type { TestCase } from '@/features/test-cases/types';
import { isActiveRun, type RunSummary } from '@/features/runs/types';
import { requestJson as api } from '@/client/api';
import { useRealtime } from '@/client/useRealtime';
import { retryVisibleRequest } from '@/client/swr';

export function useWorkspaceData(isTests: boolean) {
  const [error, setError] = useState('');
  const connection = useRef(false);
  const realtimeRefresh = useRef<() => Promise<void>>(async () => {});
  const connected = useRealtime('/api/events', () => {
    void realtimeRefresh.current();
  });
  const runInterval = useCallback(
    (data?: { runs: RunSummary[] }) =>
      connected ? 0 : data?.runs.some((run) => isActiveRun(run.status)) ? 10000 : 30000,
    [connected],
  );
  const isVisible = useCallback(
    () => document.visibilityState === 'visible' && !connection.current,
    [],
  );
  const runData = useSWR<{ runs: RunSummary[] }>('/api/runs', api, {
    refreshInterval: runInterval,
    isVisible,
    errorRetryInterval: 10000,
    onErrorRetry: retryVisibleRequest,
    onSuccess: () => setError(''),
  });
  const runs = useMemo(() => runData.data?.runs ?? [], [runData.data]);
  const { counts, latestRuns } = useMemo(() => {
    const counts = {
      queued: 0,
      preparing: 0,
      finalizing: 0,
      running: 0,
      passed: 0,
      failed: 0,
      cancelled: 0,
    };
    const latestRuns = new Map<string, RunSummary>();
    for (const run of runs) {
      counts[run.status]++;
      if (run.testId && !latestRuns.has(run.testId)) latestRuns.set(run.testId, run);
    }

    return { counts, latestRuns };
  }, [runs]);
  const running = counts.running + counts.queued + counts.preparing + counts.finalizing > 0;
  const testData = useSWR<{ tests: TestCase[] }>(isTests ? '/api/tests' : null, api, {
    refreshInterval: connected ? 0 : running ? 10000 : 30000,
    isVisible,
    errorRetryInterval: running ? 10000 : 30000,
    onErrorRetry: retryVisibleRequest,
    onSuccess: () => setError(''),
  });
  const tests = testData.data?.tests ?? [];
  const loading = runData.isLoading || (isTests && testData.isLoading);
  const loadError = runData.error || (isTests && testData.error);
  const mutateRuns = runData.mutate;
  const mutateTests = testData.mutate;
  const refresh = useCallback(async () => {
    await Promise.all([mutateRuns(), ...(isTests ? [mutateTests()] : [])]);
    setError('');
  }, [mutateRuns, mutateTests, isTests]);

  useEffect(() => {
    realtimeRefresh.current = refresh;
  }, [refresh]);
  useEffect(() => {
    connection.current = connected;
  }, [connected]);

  return {
    tests,
    runs,
    loading,
    error:
      error || (loadError instanceof Error ? loadError.message : loadError ? '无法加载工作区' : ''),
    setError,
    counts,
    latestRuns,
    running,
    connected,
    refresh,
  };
}
