'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isActiveRun, type TestRun } from '@/workspace/types';
import { createJsonReader, HttpError } from '@/client/api';
import { useRealtime } from '@/client/useRealtime';
import { usePolling } from '@/client/usePolling';
import { applyRunUpdates, type Preview, type RunUpdate } from '@/workspace/realtime';

export function useRunData(id: string, previewEnabled: boolean) {
  const [run, setRun] = useState<TestRun>();
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [now, setNow] = useState(0);
  const read = useMemo(() => createJsonReader<{ run: TestRun }>(`/api/runs/${id}`), [id]);
  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const data = await read({ signal });
        if (signal.aborted) return;
        setRun((current) =>
          current?.id === data.run.id &&
          (current.realtimeRevision ?? 0) > (data.run.realtimeRevision ?? 0)
            ? current
            : data.run,
        );
        setNow(Date.now());
        setError('');
        setUnavailable(false);
      } catch (cause) {
        if (signal.aborted) return;
        setError(cause instanceof Error ? cause.message : '无法读取执行记录');
        setUnavailable(
          cause instanceof HttpError && (cause.status === 400 || cause.status === 404),
        );
      }
    },
    [read],
  );
  const wantsPreview = !!run && isActiveRun(run.status) && previewEnabled;
  const connected = useRealtime(
    !unavailable && run?.id === id && isActiveRun(run.status)
      ? `/api/runs/${id}/events?preview=${wantsPreview ? 1 : 0}`
      : null,
    (event, data) => {
      if (event === 'snapshot') {
        setRun((data as { run: TestRun }).run);
        setError('');
      } else if (event === 'updates') {
        setRun((current) => (current ? applyRunUpdates(current, data as RunUpdate[]) : current));
      } else if (event === 'preview') setPreview(data as Preview);
    },
  );
  const refresh = usePolling(
    load,
    unavailable || connected || (run && !isActiveRun(run.status)) ? null : 5000,
  );

  const active = !!run && isActiveRun(run.status);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [active]);
  const previewUrl =
    wantsPreview &&
    connected &&
    preview &&
    (!run?.artifacts.at(-1) ||
      Date.parse(preview.capturedAt) > Date.parse(run.artifacts.at(-1)!.capturedAt))
      ? `/api/runs/${id}/preview?v=${preview.version}`
      : undefined;

  return {
    run,
    error,
    setError,
    unavailable,
    now,
    previewUrl,
    clearPreview: () => setPreview(undefined),
    refresh,
  };
}
