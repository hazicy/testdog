'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { authClient } from '@/client/auth';
import { reloadWorkspace } from '../navigation';
import { api, fetchJson } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import type { TeamWorkspace } from '@testdog/contracts/teams/types';
import styles from './Teams.module.css';

export function TeamSwitcher() {
  const t = useTranslations('teams');
  const { data: session } = authClient.useSession();
  const {
    data,
    error: loadError,
    mutate,
  } = useSWR<TeamWorkspace>(session ? '/api/teams' : null, fetchJson);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  if (!session) return null;
  if (loadError) return <Button onClick={() => mutate()}>{t('retry')}</Button>;
  if (!data) return null;
  const missing = data.activeTeamId && !data.teams.some((team) => team.id === data.activeTeamId);

  async function switchTo(value: string) {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await api.post('/api/teams', {
        json: { action: 'switch', teamId: value === 'personal' ? null : value },
      });
      reloadWorkspace('/cases');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('failed'));
      setPending(false);
    }
  }

  return (
    <div className={styles.switcher}>
      <Select
        className={styles.workspaceSelect}
        aria-label={t('workspace')}
        value={data.activeTeamId ?? 'personal'}
        disabled={pending}
        items={[
          { value: 'personal', label: t('personal') },
          ...data.teams.map((team) => ({ value: team.id, label: team.name })),
          missing ? { value: data.activeTeamId!, label: t('unavailable'), disabled: true } : null,
        ]}
        onValueChange={switchTo}
      />
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}
