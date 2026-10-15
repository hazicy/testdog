'use client';

import { useTranslations, useFormatter } from 'next-intl';

import clsx from 'clsx';

import styles from './Integrations.module.css';
import workspaceStyles from '@/features/workspace/components/workspace-index.module.css';

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';

import { browserProviderForms } from '@/features/integrations/components/browserProviderForms';
import globeIcon from '@iconify-icons/lucide/globe';
import { Input } from '@/components/ui/Input';
import { DialogHeader } from '@/components/ui/Dialog';
import { useId, useState } from 'react';
import { Icon } from '@iconify/react/offline';
import sendIcon from '@iconify-icons/lucide/send';
import mailIcon from '@iconify-icons/lucide/mail';
import settingsIcon from '@iconify-icons/lucide/settings';
import chevronRightIcon from '@iconify-icons/lucide/chevron-right';
import circleCheckIcon from '@iconify-icons/lucide/circle-check';
import closeIcon from '@iconify-icons/lucide/x';
import historyIcon from '@iconify-icons/lucide/history';
import { Dialog } from '@/components/ui/Dialog';
import useSWR from 'swr';
import { api, fetchJson } from '@/client/api';
import { useRunSubmission } from '@/client/useRunSubmission';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  notificationEvents,
  type Integration,
  type IntegrationsResponse,
  type NotificationEvent,
  type NotificationChannel,
} from '@testdog/contracts/integrations/types';

function ChannelForm({
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
  const [message, setMessage] = useState('');
  const [baseVersion, setBaseVersion] = useState(integration.version);
  const [configured, setConfigured] = useState(integration.configured);
  const [dirty, setDirty] = useState(false);
  const channel = integration.channel;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
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
      setMessage(t('saved'));
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
    setMessage('');
    try {
      await submit(`/api/integrations/${channel}/test`, {});
      setMessage(t('notificationSubmitted'));
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
        {message && (
          <p role="status" className={styles.loading}>
            {message}
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

export function Integrations() {
  const t = useTranslations('integrations');
  const format = useFormatter();
  const historyTitleId = useId();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [configuringBrowser, setConfiguringBrowser] = useState<string>();
  const { data, error, mutate } = useSWR<IntegrationsResponse>('/api/integrations', fetchJson, {
    refreshInterval: (current) =>
      current?.deliveries.some((item) => item.status === 'pending' || item.status === 'sending')
        ? 3000
        : 30000,
  });
  const selectedBrowser = data?.browserProviders.find(
    (item) => item.provider === configuringBrowser,
  );
  const BrowserForm = selectedBrowser ? browserProviderForms[selectedBrowser.provider] : undefined;
  const [configuring, setConfiguring] = useState<NotificationChannel>();
  const selectedIntegration = data?.integrations.find((item) => item.channel === configuring);
  const [retrying, setRetrying] = useState<string>();
  const [actionError, setActionError] = useState('');

  async function retry(channel: string, id: string) {
    setRetrying(id);
    setActionError('');
    try {
      await api.post(`/api/integrations/${channel}/deliveries/${id}/retry`);
      await mutate();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t('retryFailed'));
    } finally {
      setRetrying(undefined);
    }
  }

  return (
    <div className={clsx(workspaceStyles.workspaceIndex, styles.page)}>
      <h1 className={styles.accessibleLabel}>{t('title')}</h1>
      {error && (
        <p className={styles.loadError} role="alert">
          {error.message}
        </p>
      )}
      {!data ? (
        <p role="status">{t('loading')}</p>
      ) : (
        <>
          <section aria-labelledby="browser-services-title" className={styles.section}>
            <h2 id="browser-services-title" className={styles.browserServicesTitle}>
              {t('browserServices')}
            </h2>
            <div className={styles.browserServices}>
              {data.browserProviders.map((integration) => (
                <div key={integration.provider} className={styles.browserService}>
                  <Icon icon={globeIcon} width="22" aria-hidden="true" />
                  <div className={styles.serviceContent}>
                    <div className={styles.serviceHeading}>
                      <h3 className={styles.browserServicesTitle}>{integration.name}</h3>
                      {integration.configurationError ? (
                        <span className={styles.configurationError}>{t('configError')}</span>
                      ) : (
                        integration.configured && (
                          <span className={styles.configuredStatus}>
                            {integration.enabled ? t('enabled') : t('configured')}
                          </span>
                        )
                      )}
                    </div>
                    <p className={styles.serviceDescription}>
                      {integration.provider === 'browserless'
                        ? t('browserlessDescription')
                        : integration.description}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('configureName', { name: integration.name })}
                    aria-haspopup="dialog"
                    disabled={!browserProviderForms[integration.provider]}
                    onClick={() => setConfiguringBrowser(integration.provider)}
                  >
                    <Icon icon={settingsIcon} width="14" aria-hidden="true" />
                    {t('configure')}
                    <Icon icon={chevronRightIcon} width="14" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
          {selectedBrowser && BrowserForm && (
            <BrowserForm
              key={selectedBrowser.provider}
              integration={selectedBrowser}
              onSaved={mutate}
              onDismiss={() => setConfiguringBrowser(undefined)}
            />
          )}
          <section aria-labelledby="communication-title">
            <div className={styles.notificationHeading}>
              <h2 id="communication-title" className={styles.browserServicesTitle}>
                {t('notifications')}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                aria-haspopup="dialog"
                onClick={() => {
                  setActionError('');
                  setHistoryOpen(true);
                }}
              >
                <Icon icon={historyIcon} width="14" aria-hidden="true" />
                {t('history')}
              </Button>
            </div>
            <div className={styles.browserServices}>
              {data.integrations.map((integration) => (
                <div key={integration.channel} className={styles.notificationService}>
                  <Icon
                    icon={integration.channel === 'feishu' ? sendIcon : mailIcon}
                    width="22"
                    className={styles.icon}
                    aria-hidden="true"
                  />
                  <div className={styles.serviceContent}>
                    <div className={styles.serviceHeading}>
                      <h3 className={styles.browserServicesTitle}>
                        {t(`channels.${integration.channel}`)}
                      </h3>
                      {integration.channel === 'email' && !data.emailAvailable ? (
                        <span className={styles.unsavedHint}>{t('unavailable')}</span>
                      ) : integration.configured && !integration.configurationError ? (
                        <span className={styles.notificationStatus}>
                          <Icon icon={circleCheckIcon} width="12" aria-hidden="true" />
                          {integration.enabled ? t('enabled') : t('configured')}
                        </span>
                      ) : null}
                      {integration.configurationError && (
                        <span className={styles.configurationError}>{t('configError')}</span>
                      )}
                    </div>
                    <p className={styles.serviceDescription}>
                      {integration.channel === 'feishu' ? t('feishuHint') : t('emailHint')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('configureName', { name: t(`channels.${integration.channel}`) })}
                    aria-haspopup="dialog"
                    onClick={() => setConfiguring(integration.channel)}
                  >
                    <Icon icon={settingsIcon} width="14" aria-hidden="true" />
                    {t('configure')}
                    <Icon icon={chevronRightIcon} width="14" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
          {selectedIntegration && (
            <ChannelForm
              key={selectedIntegration.channel}
              integration={selectedIntegration}
              emailAvailable={data.emailAvailable}
              onSaved={mutate}
              onDismiss={() => setConfiguring(undefined)}
            />
          )}
          {historyOpen && (
            <Dialog
              titleId={historyTitleId}
              busy={!!retrying}
              onDismiss={() => setHistoryOpen(false)}
              className={styles.dialog}
            >
              <DialogHeader>
                <h2 id={historyTitleId} className={styles.heading}>
                  {t('history')}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('closeHistory')}
                  disabled={!!retrying}
                  onClick={() => setHistoryOpen(false)}
                >
                  <Icon icon={closeIcon} width="18" aria-hidden="true" />
                </Button>
              </DialogHeader>
              <section className={styles.deliveryHistory} aria-label={t('history')}>
                {actionError && (
                  <p role="alert" className={styles.deliveryError}>
                    {actionError}
                  </p>
                )}
                {!data.deliveries.length ? (
                  <p className={styles.webhookHint}>{t('noDeliveries')}</p>
                ) : (
                  <div className={styles.deliveryTable}>
                    <Table
                      className={clsx(
                        workspaceStyles.workspaceIndexTable,
                        workspaceStyles.isResults,
                        styles.table,
                      )}
                    >
                      <TableHeader className={styles.tableHeader}>
                        <TableRow>
                          <TableHead className={styles.tableHead}>
                            {t('channelNotification')}
                          </TableHead>
                          <TableHead className={styles.tableHead}>{t('status')}</TableHead>
                          <TableHead className={styles.tableHead}>{t('sentAt')}</TableHead>
                          <TableHead className={styles.tableHead}>{t('actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.deliveries.map((item) => (
                          <TableRow key={item.id} className={styles.tableRow}>
                            <TableCell className={styles.tableHead}>
                              <p>{t(`channels.${item.channel}`)}</p>
                              <p className={styles.deliveryTitle}>{item.title}</p>
                            </TableCell>
                            <TableCell className={styles.tableHead}>
                              <p>
                                {t(`deliveryStatuses.${item.status}`)} ·{' '}
                                {t('attempts', { count: item.attempts })}
                              </p>
                              {item.lastError && (
                                <p className={styles.deliveryFailure}>{item.lastError}</p>
                              )}
                            </TableCell>
                            <TableCell className={styles.tableCell}>
                              {format.dateTime(new Date(item.sentAt ?? item.createdAt), {
                                dateStyle: 'medium',
                                timeStyle: 'medium',
                              })}
                            </TableCell>
                            <TableCell className={styles.tableHead}>
                              {item.status === 'failed' && (
                                <Button
                                  disabled={
                                    retrying === item.id ||
                                    (item.channel === 'email' && !data.emailAvailable)
                                  }
                                  onClick={() => void retry(item.channel, item.id)}
                                >
                                  {t('retry')}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            </Dialog>
          )}
        </>
      )}
    </div>
  );
}
