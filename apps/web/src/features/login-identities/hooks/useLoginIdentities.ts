'use client';

import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { fetchJson } from '@/client/api';
import type { LoginIdentitiesResponse } from '@testdog/contracts/login-identities/types';
import { resumeIdentityDraft, type LoginIdentityDraft } from '@/features/login-identities/draft';

export function useLoginIdentities() {
  return useSWR<LoginIdentitiesResponse>('/api/login-identities', fetchJson, {
    refreshInterval: (current) =>
      current?.identities.some((item) => item.status === 'verifying') ? 3000 : 30000,
  });
}

export function useResumedIdentityDraft() {
  const [draft, setDraft] = useState<LoginIdentityDraft>();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const resumed = resumeIdentityDraft();

      if (resumed) setDraft(resumed);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  return [draft, setDraft] as const;
}
