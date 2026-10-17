'use client';

import useSWR, { useSWRConfig } from 'swr';
import type { FolderTree } from '@testdog/contracts/suites/types';
import { fetchJson } from '@/client/api';
import { useRealtime } from '@/client/useRealtime';

export function isCaseWorkspaceKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    ['/api/suites', '/api/tests', '/api/suite-runs', '/api/workspace/stats'].some((prefix) =>
      key.startsWith(prefix),
    )
  );
}

export function useFolderTree() {
  const { mutate } = useSWRConfig();
  const refresh = () => mutate(isCaseWorkspaceKey);
  const connected = useRealtime('/api/events', () => {
    void refresh();
  });
  const tree = useSWR<FolderTree>('/api/suites/tree', fetchJson, {
    refreshInterval: connected ? 0 : 10000,
  });

  return { ...tree, connected, refresh };
}
