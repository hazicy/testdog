'use client';

import { useTranslations } from 'next-intl';

import clsx from 'clsx';

import styles from './Integrations.module.css';
import workspaceStyles from '@/features/workspace/components/workspace-index.module.css';

import { browserProviderForms } from '@/features/integrations/components/browserProviderForms';
import globeIcon from '@iconify-icons/lucide/globe';
import { useState } from 'react';
import { Icon } from '@iconify/react/offline';
import sendIcon from '@iconify-icons/lucide/send';
import mailIcon from '@iconify-icons/lucide/mail';
import settingsIcon from '@iconify-icons/lucide/settings';
import chevronRightIcon from '@iconify-icons/lucide/chevron-right';
import circleCheckIcon from '@iconify-icons/lucide/circle-check';
import historyIcon from '@iconify-icons/lucide/history';
import useSWR from 'swr';
import { fetchJson } from '@/client/api';
import { Button } from '@/components/ui/Button';
import {
  type IntegrationsResponse,
  type NotificationChannel,
} from '@testdog/contracts/integrations/types';

import { NotificationChannelForm } from './NotificationChannelForm';
import { NotificationHistory } from './NotificationHistory';

export function Integrations() {
  const t = useTranslations('integrations');
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
                onClick={() => setHistoryOpen(true)}
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
            <NotificationChannelForm
              key={selectedIntegration.channel}
              integration={selectedIntegration}
              emailAvailable={data.emailAvailable}
              onSaved={mutate}
              onDismiss={() => setConfiguring(undefined)}
            />
          )}
          {historyOpen && (
            <NotificationHistory
              deliveries={data.deliveries}
              emailAvailable={data.emailAvailable}
              onRetried={mutate}
              onDismiss={() => setHistoryOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
