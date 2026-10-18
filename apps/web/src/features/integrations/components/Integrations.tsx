'use client';

import { useTranslations } from 'next-intl';

import clsx from 'clsx';

import styles from './Integrations.module.css';
import { PageHeader } from '@/components/shared/PageHeader';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { IntegrationCard } from '@/components/shared/IntegrationCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import workspaceStyles from '@/features/workspace/components/workspace-index.module.css';

import { browserProviderForms } from '@/features/integrations/components/browserProviderForms';
import globeIcon from '@iconify-icons/lucide/globe';
import { useState } from 'react';
import { Icon } from '@iconify/react/offline';
import sendIcon from '@iconify-icons/lucide/send';
import mailIcon from '@iconify-icons/lucide/mail';
import settingsIcon from '@iconify-icons/lucide/settings';
import chevronRightIcon from '@iconify-icons/lucide/chevron-right';
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
      <PageHeader title={t('title')} />
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
            <SectionHeader id="browser-services-title" title={t('browserServices')} />
            <div className={styles.browserServices}>
              {data.browserProviders.map((integration) => (
                <IntegrationCard
                  key={integration.provider}
                  icon={globeIcon}
                  title={integration.name}
                  description={
                    integration.provider === 'browserless'
                      ? t('browserlessDescription')
                      : integration.description
                  }
                  status={
                    <StatusBadge
                      tone={
                        integration.configurationError
                          ? 'danger'
                          : integration.configured && integration.enabled
                            ? 'success'
                            : 'neutral'
                      }
                    >
                      {integration.configurationError
                        ? t('configError')
                        : integration.configured
                          ? t(integration.enabled ? 'enabled' : 'configuredDisabled')
                          : t('unconfigured')}
                    </StatusBadge>
                  }
                  actions={
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('configureName', { name: integration.name })}
                      aria-haspopup="dialog"
                      disabled={!browserProviderForms[integration.provider]}
                      onClick={() => setConfiguringBrowser(integration.provider)}
                    >
                      <Icon icon={settingsIcon} width="16" aria-hidden="true" />
                      {t('configure')}
                      <Icon icon={chevronRightIcon} width="16" aria-hidden="true" />
                    </Button>
                  }
                />
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
            <SectionHeader
              id="communication-title"
              title={t('notifications')}
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  aria-haspopup="dialog"
                  onClick={() => setHistoryOpen(true)}
                >
                  <Icon icon={historyIcon} width="16" aria-hidden="true" />
                  {t('history')}
                </Button>
              }
            />
            <div className={styles.browserServices}>
              {data.integrations.map((integration) => (
                <IntegrationCard
                  key={integration.channel}
                  icon={integration.channel === 'feishu' ? sendIcon : mailIcon}
                  title={t(`channels.${integration.channel}`)}
                  description={integration.channel === 'feishu' ? t('feishuHint') : t('emailHint')}
                  status={
                    <>
                      <StatusBadge
                        tone={
                          integration.configurationError
                            ? 'danger'
                            : integration.configured &&
                                integration.enabled &&
                                (integration.channel !== 'email' || data.emailAvailable)
                              ? 'success'
                              : 'neutral'
                        }
                      >
                        {integration.configurationError
                          ? t('configError')
                          : integration.channel === 'email' && !data.emailAvailable
                            ? t('unavailable')
                            : integration.configured
                              ? t(integration.enabled ? 'enabled' : 'configuredDisabled')
                              : t('unconfigured')}
                      </StatusBadge>
                      {integration.configurationError &&
                        integration.channel === 'email' &&
                        !data.emailAvailable && <StatusBadge>{t('unavailable')}</StatusBadge>}
                    </>
                  }
                  actions={
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('configureName', {
                        name: t(`channels.${integration.channel}`),
                      })}
                      aria-haspopup="dialog"
                      onClick={() => setConfiguring(integration.channel)}
                    >
                      <Icon icon={settingsIcon} width="16" aria-hidden="true" />
                      {t('configure')}
                      <Icon icon={chevronRightIcon} width="16" aria-hidden="true" />
                    </Button>
                  }
                />
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
