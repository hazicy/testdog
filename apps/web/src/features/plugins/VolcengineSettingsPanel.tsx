'use client';

import { createId } from '@/client/id';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { Icon } from '@iconify/react/offline';
import plusIcon from '@iconify-icons/lucide/plus';
import trashIcon from '@iconify-icons/lucide/trash-2';
import { api, fetchJson } from '@/client/api';
import { useToastManager } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { LoadingState } from '@/components/shared/LoadingState';
import {
  VolcengineSettingsSchema,
  type ExecutionPluginSettings,
  type PluginSettingsResponse,
} from '@testdog/contracts/plugins/execution';
import styles from './Plugins.module.css';

type Group = { id: string; name: string; value: string; variantId: string };
type Experiment = { id: string; key: string; groups: Group[] };
const newGroup = (): Group => ({ id: createId(), name: '', value: '""', variantId: '' });

export function VolcengineSettingsPanel() {
  const t = useTranslations('executionPlugins');
  const { data, error, mutate } = useSWR<PluginSettingsResponse>('/api/plugins', fetchJson, {
    revalidateOnFocus: false,
  });
  const toastManager = useToastManager();
  const settings = data?.settings.find((item) => item.id === 'volcengine-abtest');

  if (error)
    return (
      <div className={styles.settings}>
        <p role="alert">{error.message}</p>
        <Button variant="ghost" onClick={() => void mutate()}>
          {t('retry')}
        </Button>
      </div>
    );
  if (!settings) return <LoadingState />;

  return (
    <VolcengineSettingsForm
      key={settings.version}
      settings={settings}
      onSaved={async (response) => {
        await mutate(response, { revalidate: false });
        toastManager.add({ title: t('saved'), type: 'success' });
      }}
    />
  );
}

function VolcengineSettingsForm({
  settings,
  onSaved,
}: {
  settings: ExecutionPluginSettings;
  onSaved: (response: PluginSettingsResponse) => Promise<void>;
}) {
  const t = useTranslations('executionPlugins');
  const [urlIncludes, setUrlIncludes] = useState(settings.config.urlIncludes);
  const [dataPath, setDataPath] = useState(settings.config.dataPath);
  const [experiments, setExperiments] = useState<Experiment[]>(() =>
    settings.config.experiments.map((item) => ({
      id: createId(),
      key: item.key,
      groups: item.groups.map((group) => ({
        id: createId(),
        name: group.name,
        value: JSON.stringify(group.value, null, 2),
        variantId: group.variantId ?? '',
      })),
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const serialize = (items: Experiment[]) =>
    items.map((item) => ({
      key: item.key,
      groups: item.groups.map(({ name, value, variantId }) => ({ name, value, variantId })),
    }));
  const originalExperiments = settings.config.experiments.map((item) => ({
    key: item.key,
    groups: item.groups.map((group) => ({
      name: group.name,
      value: JSON.stringify(group.value, null, 2),
      variantId: group.variantId ?? '',
    })),
  }));
  const dirty =
    urlIncludes !== settings.config.urlIncludes ||
    dataPath !== settings.config.dataPath ||
    JSON.stringify(serialize(experiments)) !== JSON.stringify(originalExperiments);

  function discard() {
    setUrlIncludes(settings.config.urlIncludes);
    setDataPath(settings.config.dataPath);
    setExperiments(
      settings.config.experiments.map((item) => ({
        id: createId(),
        key: item.key,
        groups: item.groups.map((group) => ({
          id: createId(),
          name: group.name,
          value: JSON.stringify(group.value, null, 2),
          variantId: group.variantId ?? '',
        })),
      })),
    );
    setError('');
  }

  function edit(id: string, operation: (item: Experiment) => Experiment) {
    setExperiments((items) => items.map((item) => (item.id === id ? operation(item) : item)));
  }

  function editGroup(experimentId: string, groupId: string, patch: Partial<Group>) {
    edit(experimentId, (item) => ({
      ...item,
      groups: item.groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    }));
  }

  return (
    <form
      className={styles.settings}
      onSubmit={async (event) => {
        event.preventDefault();
        setError('');
        setBusy(true);
        try {
          let config;

          try {
            config = VolcengineSettingsSchema.parse({
              urlIncludes,
              dataPath,
              experiments: experiments.map((item) => ({
                key: item.key,
                groups: item.groups.map((group) => ({
                  name: group.name,
                  value: JSON.parse(group.value),
                  ...(group.variantId.trim() ? { variantId: group.variantId.trim() } : {}),
                })),
              })),
            });
          } catch {
            setError(t('invalidSettings'));

            return;
          }

          const response = await api
            .put('/api/plugins/volcengine-abtest', { json: { version: settings.version, config } })
            .json<PluginSettingsResponse>();

          await onSaved(response);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : t('saveFailed'));
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className={styles.fields}>
        <section className={styles.settingsSection}>
          <h3>{t('interface')}</h3>
          <div className={styles.connectionFields}>
            <Label>
              {t('urlIncludes')}
              <Input
                required
                className={styles.monospace}
                value={urlIncludes}
                onChange={(event) => setUrlIncludes(event.target.value)}
              />
            </Label>
            <Label>
              {t('dataPath')}
              <Input
                className={styles.monospace}
                value={dataPath}
                onChange={(event) => setDataPath(event.target.value)}
              />
            </Label>
          </div>
        </section>
        <section className={styles.settingsSection}>
          <div className={styles.sectionHeader}>
            <h3>{t('experiments')}</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setExperiments((items) => [
                  ...items,
                  { id: createId(), key: '', groups: [newGroup()] },
                ]);
              }}
            >
              <Icon icon={plusIcon} aria-hidden="true" />
              {t('addExperiment')}
            </Button>
          </div>
          {experiments.map((experiment) => (
            <div key={experiment.id} className={styles.experiment}>
              <div className={styles.experimentHeader}>
                <Label>
                  {t('key')}
                  <Input
                    required
                    className={styles.monospace}
                    autoFocus={!experiment.key}
                    placeholder="checkout_layout"
                    value={experiment.key}
                    onChange={(event) =>
                      edit(experiment.id, (item) => ({ ...item, key: event.target.value }))
                    }
                  />
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('removeExperiment')}
                  title={t('removeExperiment')}
                  onClick={() => {
                    setExperiments((items) => items.filter((item) => item.id !== experiment.id));
                  }}
                >
                  <Icon icon={trashIcon} aria-hidden="true" />
                </Button>
              </div>
              <div className={styles.groupTableWrap}>
                <table className={styles.groupTable}>
                  <thead>
                    <tr>
                      <th>{t('groupName')}</th>
                      <th>{t('responseValue')}</th>
                      <th>{t('variantId')}</th>
                      <th aria-label={t('actions')} />
                    </tr>
                  </thead>
                  <tbody>
                    {experiment.groups.map((group) => (
                      <tr key={group.id}>
                        <td data-label={t('groupName')}>
                          <Input
                            aria-label={t('groupName')}
                            autoFocus={Boolean(experiment.key) && !group.name}
                            required
                            placeholder={t('groupPlaceholder')}
                            value={group.name}
                            onChange={(event) =>
                              editGroup(experiment.id, group.id, { name: event.target.value })
                            }
                          />
                        </td>
                        <td data-label={t('responseValue')}>
                          <Textarea
                            aria-label={t('value')}
                            className={styles.jsonInput}
                            rows={1}
                            required
                            placeholder='"B"'
                            value={group.value}
                            onChange={(event) =>
                              editGroup(experiment.id, group.id, { value: event.target.value })
                            }
                          />
                        </td>
                        <td data-label={t('variantId')}>
                          <Input
                            aria-label={t('variantId')}
                            className={styles.monospace}
                            placeholder={t('optional')}
                            value={group.variantId}
                            onChange={(event) =>
                              editGroup(experiment.id, group.id, { variantId: event.target.value })
                            }
                          />
                        </td>
                        <td>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={experiment.groups.length === 1}
                            aria-label={t('removeGroup')}
                            title={t('removeGroup')}
                            onClick={() => {
                              edit(experiment.id, (item) => ({
                                ...item,
                                groups: item.groups.filter((item) => item.id !== group.id),
                              }));
                            }}
                          >
                            <Icon icon={trashIcon} aria-hidden="true" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  edit(experiment.id, (item) => ({
                    ...item,
                    groups: [...item.groups, newGroup()],
                  }));
                }}
              >
                <Icon icon={plusIcon} aria-hidden="true" />
                {t('addGroup')}
              </Button>
            </div>
          ))}
        </section>
      </fieldset>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <footer className={styles.settingsFooter}>
        {dirty && (
          <Button type="button" variant="ghost" disabled={busy} onClick={discard}>
            {t('discard')}
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={busy || !dirty}>
          {busy ? t('saving') : t('saveSettings')}
        </Button>
      </footer>
    </form>
  );
}
