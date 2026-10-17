'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { authClient } from '@/client/auth';
import { reloadWorkspace } from '../navigation';
import { api, fetchJson } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { Select } from '@base-ui/react/select';
import { Icon } from '@iconify/react/offline';
import userIcon from '@iconify-icons/lucide/user-round';
import usersIcon from '@iconify-icons/lucide/users-round';
import chevronsIcon from '@iconify-icons/lucide/chevrons-up-down';
import checkIcon from '@iconify-icons/lucide/check';
import retryIcon from '@iconify-icons/lucide/refresh-cw';
import type { TeamWorkspace } from '@testdog/contracts/teams/types';
import styles from './Teams.module.css';

export function TeamSwitcher({ collapsed = false }: { collapsed?: boolean }) {
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
  if (loadError)
    return (
      <div className={styles.switcher}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => mutate()}
          aria-label={t('retry')}
          title={t('retry')}
        >
          <Icon icon={retryIcon} width="18" aria-hidden="true" />
        </Button>
      </div>
    );
  if (!data) return null;
  const missing = data.activeTeamId && !data.teams.some((team) => team.id === data.activeTeamId);

  async function switchTo(value: string) {
    if (pending || value === (data?.activeTeamId ?? 'personal')) return;
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

  const options = [
    { value: 'personal', label: t('personal') },
    ...data.teams.map((team) => ({ value: team.id, label: team.name })),
    ...(missing ? [{ value: data.activeTeamId!, label: t('unavailable'), disabled: true }] : []),
  ];
  const active = options.find((item) => item.value === (data.activeTeamId ?? 'personal'))!;

  return (
    <div className={styles.switcher} data-collapsed={collapsed}>
      <Select.Root
        items={options}
        value={active.value}
        disabled={pending}
        onValueChange={(value) => {
          if (value !== null) void switchTo(value);
        }}
      >
        <Select.Trigger
          className={styles.workspaceTrigger}
          aria-label={t('workspace')}
          aria-busy={pending}
          title={`${t('workspace')} · ${active.label}`}
        >
          <span className={styles.workspaceAvatar} aria-hidden="true">
            <Icon icon={data.activeTeamId ? usersIcon : userIcon} width="18" />
          </span>
          <Select.Value className={styles.workspaceName} />
          <Select.Icon className={styles.workspaceChevron}>
            <Icon icon={chevronsIcon} width="14" aria-hidden="true" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            className={styles.positioner}
            sideOffset={6}
            align="start"
            alignItemWithTrigger={false}
          >
            <Select.Popup className={styles.workspacePopup}>
              <Select.List>
                {options.map((item) => (
                  <Select.Item
                    key={item.value}
                    value={item.value}
                    disabled={'disabled' in item && item.disabled}
                    className={styles.workspaceItem}
                  >
                    <span className={styles.workspaceAvatar} aria-hidden="true">
                      <Icon icon={item.value === 'personal' ? userIcon : usersIcon} width="18" />
                    </span>
                    <Select.ItemText className={styles.optionName}>{item.label}</Select.ItemText>
                    <Select.ItemIndicator className={styles.selectedIndicator}>
                      <Icon icon={checkIcon} width="16" aria-hidden="true" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}
