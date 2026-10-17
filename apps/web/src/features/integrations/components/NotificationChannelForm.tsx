'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@iconify/react/offline';
import closeIcon from '@iconify-icons/lucide/x';
import { api } from '@/client/api';
import { useRunSubmission } from '@/client/useRunSubmission';
import { useToastManager } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Dialog, DialogHeader } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import {
  notificationEvents,
  type Integration,
  type NotificationEvent,
} from '@testdog/contracts/integrations/types';
import styles from './Integrations.module.css';

export function NotificationChannelForm({
  integration,
  emailAvailable,
  onSaved,
  onDismiss,
}: {
  integration: Integration;
  emailAvailable: boolean;
  onSaved: () => Promise<unknown>;
  onDismiss: () => void;
}) {
  const t = useTranslations('integrations');
  const titleId = useId();
  const submit = useRunSubmission();
  const [enabled, setEnabled] = useState(integration.enabled);
  const [events, setEvents] = useState<NotificationEvent[]>(
    integration.configured ? integration.events : ['run.failed', 'issue.created'],
  );
  const [webhook, setWebhook] = useState('');
  const [signingSecret, setSigningSecret] = useState('');
  const [clearSigningSecret, setClearSigningSecret] = useState(false);
  const [recipients, setRecipients] = useState(integration.email?.recipients.join(', ') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toastManager = useToastManager();
  const [baseVersion, setBaseVersion] = useState(integration.version);
  const [configured, setConfigured] = useState(integration.configured);
  const [dirty, setDirty] = useState(false);
  const channel = integration.channel;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const json = {
        version: baseVersion,
        enabled,
        events,
        ...(channel === 'feishu'
          ? {
              ...(webhook.trim() ? { webhookUrl: webhook.trim() } : {}),
              ...(signingSecret.trim() ? { signingSecret: signingSecret.trim() } : {}),
              clearSigningSecret,
            }
          : {
              recipients: recipients.split(/[,;\s]+/).filter(Boolean),
            }),
      };
      const result = await api
        .put(`/api/integrations/${channel}`, { json })
        .json<{ integration: Integration }>();

      setBaseVersion(result.integration.version);
      setConfigured(true);
      setWebhook('');
      setSigningSecret('');
      setClearSigningSecret(false);
      setDirty(false);
      toastManager.add({ title: t('saved'), type: 'success' });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setError('');

    try {
      await submit(`/api/integrations/${channel}/test`, {});
      toastManager.add({ title: t('notificationSubmitted'), type: 'success' });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('notificationFailed'));
    } finally {
      setBusy(false);
    }
  }

  const field = (
    label: string,
    value: string,
    update: (value: string) => void,
    type = 'text',
    placeholder?: string,
  ) => (
    <div>
      <label className={styles.field} htmlFor={`${channel}-${label}`}>
        {label}
      </label>
      <Input
        id={`${channel}-${label}`}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        onChange={(event) => update(event.target.value)}
        required={channel === 'email' && type !== 'password'}
      />
    </div>
  );

  return (
    <Dialog titleId={titleId} busy={busy} onDismiss={onDismiss} initialFocus="input">
      <DialogHeader>
        <div>
          <h2 id={titleId} className={styles.heading}>
            {t(`channels.${channel}`)}
          </h2>
          <p className={styles.subtitle}>
            {configured
              ? integration.enabled
                ? t('enabled')
                : t('configuredDisabled')
              : t('unconfigured')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('closeConfig')}
          disabled={busy}
          onClick={onDismiss}
        >
          <Icon icon={closeIcon} width="18" aria-hidden="true" />
        </Button>
      </DialogHeader>
      {integration.configurationError && (
        <p className={styles.error} role="alert">
          {integration.configurationError}
        </p>
      )}
      <form onSubmit={save} onChange={() => setDirty(true)} className={styles.form}>
        {channel === 'feishu' ? (
          <>
            <p className={styles.webhookHint}>{t('feishuSetup')}</p>
            {field(
              t('webhook'),
              webhook,
              setWebhook,
              'password',
              configured ? t('keepAddress') : 'https://open.feishu.cn/open-apis/bot/v2/hook/…',
            )}
            {field(
              t('signingSecret'),
              signingSecret,
              setSigningSecret,
              'password',
              integration.hasSigningSecret ? t('keepSecret') : t('secretHint'),
            )}
            {integration.hasSigningSecret && (
              <label className={styles.clearSecret}>
                <Checkbox
                  checked={clearSigningSecret}
                  onCheckedChange={(value) => {
                    setClearSigningSecret(value);
                    setDirty(true);
                  }}
                />
                {t('clearSecret')}
              </label>
            )}
          </>
        ) : (
          <>
            {!emailAvailable && (
              <p role="status" className={styles.webhookHint}>
                {t('emailUnavailable')}
              </p>
            )}
            {field(t('recipients'), recipients, setRecipients, 'text', t('recipientsHint'))}
          </>
        )}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{t('eventsLabel')}</legend>
          {Object.keys(notificationEvents).map((value) => (
            <label key={value} className={styles.clearSecret}>
              <Checkbox
                checked={events.includes(value as NotificationEvent)}
                onCheckedChange={(checked) => {
                  setEvents((current) =>
                    checked
                      ? [...current, value as NotificationEvent]
                      : current.filter((item) => item !== value),
                  );
                  setDirty(true);
                }}
              />
              {t(`events.${value as NotificationEvent}`)}
            </label>
          ))}
        </fieldset>
        <label className={styles.clearSecret}>
          <Checkbox
            checked={enabled}
            onCheckedChange={(value) => {
              setEnabled(value);
              setDirty(true);
            }}
          />
          {t('enableNotifications')}
        </label>
        {error && (
          <p role="alert" className={styles.saveError}>
            {error}
          </p>
        )}
        <div className={styles.container}>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t('processing') : t('save')}
          </Button>
          <Button
            type="button"
            disabled={busy || !configured || dirty || (channel === 'email' && !emailAvailable)}
            onClick={() => void test()}
          >
            {t('sendTest')}
          </Button>
        </div>
        {dirty && configured && <p className={styles.unsavedHint}>{t('saveBeforeTest')}</p>}
      </form>
    </Dialog>
  );
}
