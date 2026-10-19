'use client';

import { useSWRConfig } from 'swr';
import { useRealtime } from '@/client/useRealtime';

export function useIssueRealtime() {
  const { mutate } = useSWRConfig();

  return useRealtime('/api/events', () => {
    void mutate((key) => typeof key === 'string' && key.startsWith('/api/issues'));
  });
}
