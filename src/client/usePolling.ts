'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createRefreshTask } from './refreshTask';

export function usePolling(load: (signal: AbortSignal) => Promise<void>, interval: number | null) {
  const task = useRef<ReturnType<typeof createRefreshTask> | null>(null);
  useEffect(() => {
    const current = createRefreshTask(load);
    task.current = current;
    // Start after mount; cancelled effects never update state.
    const initial = setTimeout(() => void current.refresh(), 0);
    return () => {
      clearTimeout(initial);
      current.dispose();
      task.current = null;
    };
  }, [load]);
  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === 'visible') void task.current?.refresh();
    };
    const timer = interval === null ? undefined : setInterval(poll, interval);
    if (interval !== null) {
      window.addEventListener('focus', poll);
      document.addEventListener('visibilitychange', poll);
    }
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', poll);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [interval]);
  return useCallback(() => task.current?.refresh(true) ?? Promise.resolve(), []);
}
