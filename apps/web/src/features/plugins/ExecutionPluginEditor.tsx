'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Icon } from '@iconify/react/offline';
import flameIcon from '@iconify-icons/lucide/flame';
import externalIcon from '@iconify-icons/lucide/arrow-up-right';
import useSWR from 'swr';
import { fetchJson } from '@/client/api';
import { Dialog, DialogHeader, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { LoadingState } from '@/components/shared/LoadingState';
import {
  validatePlugin,
  type PluginInvocation,
  type PluginSettingsResponse,
} from '@testdog/contracts/plugins/execution';
import styles from './ExecutionPluginEditor.module.css';

export function ExecutionPluginEditor({
  invocation,
  onSave,
  onDismiss,
}: {
  invocation?: PluginInvocation;
  onSave: (plugin: PluginInvocation, title: string) => void;
  onDismiss: () => void;
}) {
  const t = useTranslations('executionPlugins');
  const titleId = useId();
  const { data, error } = useSWR<PluginSettingsResponse>('/api/plugins', fetchJson);
  const [key, setKey] = useState(String(invocation?.config.key ?? ''));
  const [group, setGroup] = useState(String(invocation?.config.group ?? ''));
  const experiments =
    data?.settings.find((item) => item.id === 'volcengine-abtest')?.config.experiments ?? [];
  const experiment = experiments.find((item) => item.key === key);
  const valid = Boolean(experiment?.groups.some((item) => item.name === group));

  return (
    <Dialog titleId={titleId} busy={false} onDismiss={onDismiss} className={styles.drawer}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          const plugin = { id: invocation?.id ?? 'volcengine-abtest', config: { key, group } };

          validatePlugin(plugin);
          onSave(plugin, `${key} · ${group}`);
        }}
      >
        <DialogHeader>
          <div className={styles.heading}>
            <span className={styles.icon}>
              <Icon icon={flameIcon} aria-hidden="true" />
            </span>
            <h2 id={titleId}>{t('volcengine-abtest')}</h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('close')}
            onClick={onDismiss}
          >
            ×
          </Button>
        </DialogHeader>
        <div className={styles.body}>
          {!data && !error ? (
            <LoadingState />
          ) : error ? (
            <p role="alert">{error.message}</p>
          ) : !experiments.length ? (
            <p>{t('configureFirst')}</p>
          ) : (
            <>
              <Label>
                {t('key')}
                <Select
                  aria-label={t('key')}
                  value={key}
                  onValueChange={(value) => {
                    setKey(value);
                    setGroup('');
                  }}
                  items={[
                    { value: '', label: t('chooseKey') },
                    ...experiments.map((item) => ({ value: item.key, label: item.key })),
                    ...(key && !experiment ? [{ value: key, label: key, disabled: true }] : []),
                  ]}
                />
              </Label>
              <Label>
                {t('group')}
                <Select
                  aria-label={t('group')}
                  disabled={!experiment}
                  value={group}
                  onValueChange={setGroup}
                  items={[
                    { value: '', label: t('chooseGroup') },
                    ...(experiment?.groups.map((item) => ({
                      value: item.name,
                      label: item.name,
                    })) ?? []),
                    ...(group && !valid ? [{ value: group, label: group, disabled: true }] : []),
                  ]}
                />
              </Label>
            </>
          )}
          <Link
            className={styles.settingsLink}
            href="/plugins?plugin=volcengine-abtest"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('pluginSettings')}
            <Icon icon={externalIcon} aria-hidden="true" />
          </Link>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDismiss}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            {t('save')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
