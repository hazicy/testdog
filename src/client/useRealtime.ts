'use client';

import { useEffect, useRef, useState } from 'react';

// One connection per page. React state changes do not recreate its event handlers.
export function useRealtime(url: string | null, onEvent: (event: string, data: unknown) => void) {
  const handler = useRef(onEvent);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);
  useEffect(() => {
    let source: EventSource | undefined;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const disconnect = () => {
      clearTimeout(watchdog);
      source?.close();
      source = undefined;
      setConnected(false);
    };

    const connect = () => {
      clearTimeout(retry);
      disconnect();
      if (!url || document.visibilityState !== 'visible' || !active) return;
      source = new EventSource(url);
      source.onerror = () => {
        setConnected(false);
      };

      source.addEventListener('ready', () => {
        clearTimeout(watchdog);
        setConnected(true);
      });
      for (const name of ['snapshot', 'updates', 'preview', 'changed'])
        source.addEventListener(name, (event) => {
          try {
            handler.current(name, JSON.parse((event as MessageEvent).data));
          } catch {
            disconnect();
          }
        });
      source.addEventListener('done', disconnect);
      // A proxy may return headers but buffer the body indefinitely.
      watchdog = setTimeout(() => {
        if (active) {
          disconnect();
          retry = setTimeout(connect, 5000);
        }
      }, 20000);
    };

    const visibility = () => {
      if (document.visibilityState === 'visible') connect();
      else {
        clearTimeout(retry);
        disconnect();
      }
    };

    connect();
    document.addEventListener('visibilitychange', visibility);

    return () => {
      active = false;
      clearTimeout(retry);
      clearTimeout(watchdog);
      source?.close();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [url]);

  return connected;
}
