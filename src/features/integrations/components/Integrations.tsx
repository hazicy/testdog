'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api, fetchJson } from '@/client/api';
import { useRunSubmission } from '@/client/useRunSubmission';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Select } from '@/components/ui/Select';
import {
  notificationKinds,
  notificationEvents,
  deliveryStatuses,
  type Integration,
  type IntegrationsResponse,
  type NotificationEvent,
} from '../types';

function ChannelForm({
  integration,
  onSaved,
}: {
  integration: Integration;
  onSaved: () => Promise<unknown>;
}) {
  const submit = useRunSubmission();
  const [enabled, setEnabled] = useState(integration.enabled);
  const [events, setEvents] = useState<NotificationEvent[]>(
    integration.configured ? integration.events : ['run.failed', 'issue.created'],
  );
  const [webhook, setWebhook] = useState('');
  const [signingSecret, setSigningSecret] = useState('');
  const [clearSigningSecret, setClearSigningSecret] = useState(false);
  const [host, setHost] = useState(integration.email?.host ?? '');
  const [port, setPort] = useState(integration.email?.port ?? 465);
  const [username, setUsername] = useState(integration.email?.username ?? '');
  const [password, setPassword] = useState('');
  const [from, setFrom] = useState(integration.email?.from ?? '');
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
              host,
              port,
              username,
              ...(password ? { password } : {}),
              from,
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
      setPassword('');
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
      setMessage('测试通知已提交，请在下方发送记录查看结果。');
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
      <label className="mb-2 block text-sm" htmlFor={`${channel}-${label}`}>
        {label}
      </label>
      <input
        id={`${channel}-${label}`}
        type={type}
        className="ws-input"
        value={value}
        placeholder={placeholder}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        onChange={(event) => update(event.target.value)}
        required={channel === 'email' && type !== 'password'}
      />
    </div>
  );

  return (
    <section
      className="rounded-xl border border-page-line bg-surface p-6"
      aria-label={notificationKinds[channel]}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{notificationKinds[channel]}</h2>
        <span className="text-sm text-page-muted">
          {configured ? (integration.enabled ? '已启用' : '已配置 · 未启用') : '未配置'}
        </span>
      </div>
      {integration.configurationError && (
        <p className="mb-4 text-sm text-red-500" role="alert">
          {integration.configurationError}
        </p>
      )}
      <form onSubmit={save} onChange={() => setDirty(true)} className="space-y-4">
        {channel === 'feishu' ? (
          <>
            <p className="text-sm text-page-muted">
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
              <label className="flex items-center gap-2 text-sm">
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
            <p className="text-sm text-page-muted">
              通过 SMTP 发送邮件，可使用邮箱服务提供的授权码。
            </p>
            {field('SMTP 服务器', host, setHost, 'text', 'smtp.example.com')}
            <Select
              aria-label="SMTP 端口与加密"
              value={port}
              onValueChange={(value) => {
                setPort(Number(value) as 465 | 587);
                setDirty(true);
              }}
              items={[
                { value: 465, label: '465 · TLS' },
                { value: 587, label: '587 · STARTTLS' },
              ]}
            />
            {field('SMTP 账号', username, setUsername)}
            {field(
              'SMTP 密码或授权码',
              password,
              setPassword,
              'password',
              integration.hasPassword ? '已保存，留空保留原授权码' : '填写邮箱授权码',
            )}
            {field('发件邮箱', from, setFrom, 'email')}
            {field('收件邮箱', recipients, setRecipients, 'text', '多个邮箱用逗号分隔，最多10个')}
          </>
        )}
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">通知事件</legend>
          {Object.entries(notificationEvents).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
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
        <label className="flex items-center gap-2 text-sm">
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
          <p role="alert" className="text-sm text-error-ink">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-step-success">
            {message}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="ws-button primary" disabled={busy}>
            {busy ? '处理中…' : '保存配置'}
          </Button>
          <Button
            type="button"
            className="ws-button"
            disabled={busy || !configured || dirty}
            onClick={() => void test()}
          >
            发送测试通知
          </Button>
        </div>
        {dirty && configured && (
          <p className="text-xs text-page-muted">先保存修改，再发送测试通知。</p>
        )}
      </form>
    </section>
  );
}

export function Integrations() {
  const { data, error, mutate } = useSWR<IntegrationsResponse>('/api/integrations', fetchJson, {
    refreshInterval: (current) =>
      current?.deliveries.some((item) => item.status === 'pending' || item.status === 'sending')
        ? 3000
        : 30000,
  });
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
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <div className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">集成</h1>
          <p className="mt-2 text-sm text-page-muted">将测试与问题处理结果发送到飞书或邮箱。</p>
        </div>
        <Button className="ws-button" onClick={() => void mutate()}>
          刷新
        </Button>
      </div>
      {(error || actionError) && (
        <p className="mb-4 text-error-ink" role="alert">
          {actionError || error?.message}
        </p>
      )}
      {!data ? (
        <p role="status">正在加载通知配置…</p>
      ) : (
        <>
          <div className="grid items-start gap-6 lg:grid-cols-2">
            {data.integrations.map((integration) => (
              <ChannelForm key={integration.channel} integration={integration} onSaved={mutate} />
            ))}
          </div>
          <section className="mt-8" aria-label="发送记录">
            <h2 className="mb-4 text-lg font-semibold">最近发送记录</h2>
            {!data.deliveries.length ? (
              <p className="text-sm text-page-muted">尚无发送记录。保存配置后可发送测试通知。</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-page-line">
                <table className="w-full text-left text-sm">
                  <thead className="bg-page">
                    <tr>
                      <th className="p-4">渠道 / 通知</th>
                      <th className="p-4">状态</th>
                      <th className="p-4">发送时间</th>
                      <th className="p-4">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.deliveries.map((item) => (
                      <tr key={item.id} className="border-t border-page-line">
                        <td className="p-4">
                          <p>{notificationKinds[item.channel]}</p>
                          <p className="mt-1 text-page-muted">{item.title}</p>
                        </td>
                        <td className="p-4">
                          <p>
                            {deliveryStatuses[item.status]} · {item.attempts} 次尝试
                          </p>
                          {item.lastError && (
                            <p className="mt-1 max-w-sm text-xs text-error-ink">{item.lastError}</p>
                          )}
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          {new Date(item.sentAt ?? item.createdAt).toLocaleString('zh-CN')}
                        </td>
                        <td className="p-4">
                          {item.status === 'failed' && (
                            <Button
                              className="ws-button"
                              disabled={retrying === item.id}
                              onClick={() => void retry(item.channel, item.id)}
                            >
                              重试
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
