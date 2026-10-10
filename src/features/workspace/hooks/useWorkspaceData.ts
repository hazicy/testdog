'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TestCase } from '@/features/test-cases/types';
import type { RunSummary } from '@/features/runs/types';
import { requestJson as api } from '@/client/api';
import { useRealtime } from '@/client/useRealtime';
import { usePolling } from '@/client/usePolling';

export function useWorkspaceData(isTests: boolean) {
  const [tests, setTests] = useState<TestCase[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const [testData, runData] = await Promise.all([
          isTests ? api<{ tests: TestCase[] }>('/api/tests', { signal }) : undefined,
          api<{ runs: RunSummary[] }>('/api/runs', { signal }),
        ]);
        if (signal.aborted) return;
        if (testData) setTests(testData.tests);
        setRuns(runData.runs);
        setError('');
      } catch (cause) {
        if (signal.aborted) return;
        setError(cause instanceof Error ? cause.message : '无法加载工作区');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [isTests],
  );
  const realtimeRefresh = useRef<() => Promise<void>>(async () => {});
  const connected = useRealtime('/api/events', () => {
    void realtimeRefresh.current();
  });
  const refresh = usePolling(load, connected ? null : running ? 10000 : 30000);

  useEffect(() => {
    realtimeRefresh.current = refresh;
  }, [refresh]);

  return { tests, runs, loading, error, setError, counts, latestRuns, running, connected, refresh };
}
