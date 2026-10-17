'use client';

import { useEffect, type ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { usePathname } from 'next/navigation';
import { workspaceChangeKey } from '@/features/teams/navigation';
import { authClient } from '@/client/auth';

const createCache = () => new Map();

// Remount data consumers as well as their cache when the account changes.
// This also tears down old SSE connections and clears component-local evidence.
export function AuthCacheBoundary({ children }: { children: ReactNode }) {
  const { data: session } = authClient.useSession();
  const pathname = usePathname();
  // The public landing has no account data and must not remount when session loading completes.
  const cacheKey = pathname === '/' ? 'landing' : (session?.user.id ?? 'anonymous');

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === workspaceChangeKey) window.location.reload();
    };

    window.addEventListener('storage', changed);

    return () => window.removeEventListener('storage', changed);
  }, []);

  return (
    <SWRConfig key={cacheKey} value={{ provider: createCache }}>
      {children}
    </SWRConfig>
  );
}
