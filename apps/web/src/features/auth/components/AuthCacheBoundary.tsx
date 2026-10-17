'use client';

import { useEffect, type ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { workspaceChangeKey } from '@/features/teams/navigation';
import { authClient } from '@/client/auth';

const createCache = () => new Map();

// Remount data consumers as well as their cache when the account changes.
// This also tears down old SSE connections and clears component-local evidence.
export function AuthCacheBoundary({ children }: { children: ReactNode }) {
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === workspaceChangeKey) window.location.reload();
    };

    window.addEventListener('storage', changed);

    return () => window.removeEventListener('storage', changed);
  }, []);

  return (
    <SWRConfig key={session?.user.id ?? 'anonymous'} value={{ provider: createCache }}>
      {children}
    </SWRConfig>
  );
}
