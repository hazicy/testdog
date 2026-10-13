'use client';

import { classNames } from '@/components/ui/classNames';

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
  notificationKinds,
  notificationEvents,
  deliveryStatuses,
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
      setMessage('配置已保存。');
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
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
      setMessage('测试通知已提交，可在发送记录查看结果。');
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '测试通知提交失败');
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
            {notificationKinds[channel]}
          </h2>
          <p className={styles.subtitle}>
            {configured ? (integration.enabled ? '已启用' : '已配置 · 未启用') : '未配置'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="关闭配置"
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
            <p className={styles.webhookHint}>
              添加飞书群自定义机器人后，填写 Webhook 地址。通知内容包含 testdog 标识，支持签名校验。
            </p>
            {field(
              'Webhook 地址',
              webhook,
              setWebhook,
              'password',
              configured
                ? '已保存，留空保留原地址'
                : 'https://open.feishu.cn/open-apis/bot/v2/hook/…',
            )}
            {field(
              '签名密钥（可选）',
              signingSecret,
              setSigningSecret,
              'password',
              integration.hasSigningSecret ? '已保存，留空保留原密钥' : '机器人启用签名校验时填写',
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
                清除已保存的签名密钥
              </label>
            )}
          </>
        ) : (
          <>
            {!emailAvailable && (
              <p role="status" className={styles.webhookHint}>
                邮件通知暂不可用，请联系管理员。
              </p>
            )}
            {field('收件邮箱', recipients, setRecipients, 'text', '多个邮箱用逗号分隔，最多10个')}
          </>
        )}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>通知事件</legend>
          {Object.entries(notificationEvents).map(([value, label]) => (
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
              {label}
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
          启用事件通知
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
            {busy ? '处理中…' : '保存配置'}
          </Button>
          <Button
            type="button"
            disabled={busy || !configured || dirty || (channel === 'email' && !emailAvailable)}
            onClick={() => void test()}
          >
            发送测试通知
          </Button>
        </div>
        {dirty && configured && <p className={styles.unsavedHint}>先保存修改，再发送测试通知。</p>}
      </form>
    </Dialog>
  );
}

export function Integrations() {
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
      setActionError(cause instanceof Error ? cause.message : '重试失败');
    } finally {
      setRetrying(undefined);
    }
  }

  return (
    <div className={classNames(workspaceStyles.workspaceIndex, styles.page)}>
      <h1 className={styles.accessibleLabel}>集成</h1>
      {error && (
        <p className={styles.loadError} role="alert">
          {error.message}
        </p>
      )}
      {!data ? (
        <p role="status">正在加载集成配置…</p>
      ) : (
        <>
          <section aria-labelledby="browser-services-title" className={styles.section}>
            <h2 id="browser-services-title" className={styles.browserServicesTitle}>
              浏览器服务
            </h2>
            <div className={styles.browserServices}>
              {data.browserProviders.map((integration) => (
                <div key={integration.provider} className={styles.browserService}>
                  <Icon icon={globeIcon} width="22" aria-hidden="true" />
                  <div className={styles.serviceContent}>
                    <div className={styles.serviceHeading}>
                      <h3 className={styles.browserServicesTitle}>{integration.name}</h3>
                      {integration.configurationError ? (
                        <span className={styles.configurationError}>配置异常</span>
                      ) : (
                        integration.configured && (
                          <span className={styles.configuredStatus}>
                            {integration.enabled ? '已启用' : '已配置'}
                          </span>
                        )
                      )}
                    </div>
                    <p className={styles.serviceDescription}>{integration.description}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`配置${integration.name}`}
                    aria-haspopup="dialog"
                    disabled={!browserProviderForms[integration.provider]}
                    onClick={() => setConfiguringBrowser(integration.provider)}
                  >
                    <Icon icon={settingsIcon} width="14" aria-hidden="true" />
                    配置
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
                消息通知
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
                发送记录
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
                        {notificationKinds[integration.channel]}
                      </h3>
                      {integration.channel === 'email' && !data.emailAvailable ? (
                        <span className={styles.unsavedHint}>暂不可用</span>
                      ) : integration.configured && !integration.configurationError ? (
                        <span className={styles.notificationStatus}>
                          <Icon icon={circleCheckIcon} width="12" aria-hidden="true" />
                          {integration.enabled ? '已启用' : '已配置'}
                        </span>
                      ) : null}
                      {integration.configurationError && (
                        <span className={styles.configurationError}>配置异常</span>
                      )}
                    </div>
                    <p className={styles.serviceDescription}>
                      {integration.channel === 'feishu'
                        ? '在飞书群接收测试结果和问题通知。'
                        : '通过邮件向团队发送测试结果和问题通知。'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`配置${notificationKinds[integration.channel]}`}
                    aria-haspopup="dialog"
                    onClick={() => setConfiguring(integration.channel)}
                  >
                    <Icon icon={settingsIcon} width="14" aria-hidden="true" />
                    配置
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
                  发送记录
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="关闭发送记录"
                  disabled={!!retrying}
                  onClick={() => setHistoryOpen(false)}
                >
                  <Icon icon={closeIcon} width="18" aria-hidden="true" />
                </Button>
              </DialogHeader>
              <section className={styles.deliveryHistory} aria-label="发送记录">
                {actionError && (
                  <p role="alert" className={styles.deliveryError}>
                    {actionError}
                  </p>
                )}
                {!data.deliveries.length ? (
                  <p className={styles.webhookHint}>暂无发送记录。</p>
                ) : (
                  <div className={styles.deliveryTable}>
                    <Table
                      className={classNames(
                        workspaceStyles.workspaceIndexTable,
                        workspaceStyles.isResults,
                        styles.table,
                      )}
                    >
                      <TableHeader className={styles.tableHeader}>
                        <TableRow>
                          <TableHead className={styles.tableHead}>渠道 / 通知</TableHead>
                          <TableHead className={styles.tableHead}>状态</TableHead>
                          <TableHead className={styles.tableHead}>发送时间</TableHead>
                          <TableHead className={styles.tableHead}>操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.deliveries.map((item) => (
                          <TableRow key={item.id} className={styles.tableRow}>
                            <TableCell className={styles.tableHead}>
                              <p>{notificationKinds[item.channel]}</p>
                              <p className={styles.deliveryTitle}>{item.title}</p>
                            </TableCell>
                            <TableCell className={styles.tableHead}>
                              <p>
                                {deliveryStatuses[item.status]} · {item.attempts} 次尝试
                              </p>
                              {item.lastError && (
                                <p className={styles.deliveryFailure}>{item.lastError}</p>
                              )}
                            </TableCell>
                            <TableCell className={styles.tableCell}>
                              {new Date(item.sentAt ?? item.createdAt).toLocaleString('zh-CN')}
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
                                  重试
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
