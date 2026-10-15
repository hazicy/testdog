'use client';

import { useTranslations } from 'next-intl';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { isActiveRun, type TestRun } from '@testdog/contracts/runs/types';
import { isHTTPError } from 'ky';
import { createJsonReader } from '@/client/etag';
import { useRealtime } from '@/client/useRealtime';
import { retryVisibleRequest } from '@/client/swr';
import {
  applyRunUpdates,
  type Preview,
  type RunUpdate,
} from '@testdog/contracts/runs/lib/realtime';

export function useRunData(id: string, previewEnabled: boolean) {
  const t = useTranslations('runs');
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const { cache } = useSWRConfig();
  const url = `/api/runs/${id}`;
  const connection = useRef({ url, connected: false });
  const read = useMemo(() => createJsonReader<{ run: TestRun }>(url), [url]);
  const fetcher = useCallback(async () => {
    const { run: incoming } = await read();
    // HTTP reads and SSE share a cache; a delayed response must not roll it back.
    const current = cache.get(url)?.data as TestRun | undefined;

    return newestRun(current, incoming);
  }, [read, cache, url]);
  const canAutoRefresh = useCallback(() => {
    const state = cache.get(url);
    const current = state?.data as TestRun | undefined;

    return (
      document.visibilityState === 'visible' &&
      !(connection.current.url === url && connection.current.connected) &&
      !isUnavailable(state?.error) &&
      (!current || isActiveRun(current.status))
    );
  }, [cache, url]);
  const {
    data: run,
    error: loadError,
    mutate,
  } = useSWR<TestRun>(url, fetcher, {
    refreshInterval: 5000,
    // Gate polling, focus, reconnect and error retries with the same live state.
    isVisible: canAutoRefresh,
    onSuccess: () => setError(''),
    errorRetryInterval: 5000,
    onErrorRetry: retryVisibleRequest,
  });
  const unavailable = isUnavailable(loadError);
  const refresh = useCallback(async () => {
    await mutate();
    setError('');
  }, [mutate]);
  const wantsPreview = !!run && isActiveRun(run.status) && previewEnabled;
  const connected = useRealtime(
    !unavailable && run?.id === id && isActiveRun(run.status)
      ? `${url}/events?preview=${wantsPreview ? 1 : 0}`
      : null,
    (event, data) => {
      if (event === 'snapshot') {
        void mutate((current) => newestRun(current, (data as { run: TestRun }).run), {
          revalidate: false,
        });
        setError('');
      } else if (event === 'updates') {
        void mutate(
          (current) => (current ? applyRunUpdates(current, data as RunUpdate[]) : current),
          {
            revalidate: false,
          },
        );
      } else if (event === 'preview') setPreview(data as Preview);
    },
  );

  useEffect(() => {
    connection.current = { url, connected };
  }, [url, connected]);
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
    error:
      error ||
      (loadError instanceof Error ? loadError.message : loadError ? t('runLoadFailed') : ''),
    setError,
    unavailable,
    previewUrl,
    clearPreview: () => setPreview(undefined),
    refresh,
  };
}

function isUnavailable(error: unknown) {
  return isHTTPError(error) && (error.response.status === 400 || error.response.status === 404);
}

function newestRun(current: TestRun | undefined, incoming: TestRun): TestRun {
  return current?.id === incoming.id &&
    (current.realtimeRevision ?? 0) > (incoming.realtimeRevision ?? 0)
    ? current
    : incoming;
}
