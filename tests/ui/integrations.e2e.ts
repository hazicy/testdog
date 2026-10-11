import { expect, test } from '@playwright/test';
import type { Integration, IntegrationsResponse } from '../../src/features/integrations/types';

const defaults: Integration[] = [
  {
    channel: 'feishu',
    version: 0,
    enabled: false,
    events: [],
    configured: false,
    hasSigningSecret: false,
    hasPassword: false,
  },
  {
    channel: 'email',
    version: 0,
    enabled: false,
    events: [],
    configured: false,
    hasSigningSecret: false,
    hasPassword: false,
  },
];

test('configures Feishu, keeps saved secrets hidden and shows queued test delivery', async ({
  page,
}) => {
  const data: IntegrationsResponse = { integrations: structuredClone(defaults), deliveries: [] };
  const payloads: Record<string, unknown>[] = [];

  await page.route('**/api/integrations', (route) => route.fulfill({ json: data }));
  await page.route('**/api/integrations/feishu', (route) => {
    const input = route.request().postDataJSON();

    payloads.push(input);
    data.integrations[0] = {
      ...data.integrations[0],
      configured: true,
      version: input.version + 1,
      enabled: input.enabled,
      events: input.events,
      hasSigningSecret: true,
    };

    return route.fulfill({ json: { integration: data.integrations[0] } });
  });
  await page.route('**/api/integrations/feishu/test', (route) => {
    data.deliveries.push({
      id: 'test-delivery',
      channel: 'feishu',
      title: '测试通知',
      eventType: 'test',
      status: 'sent',
      attempts: 1,
      lastError: null,
      createdAt: '2026-10-01T00:00:00Z',
      sentAt: '2026-10-01T00:00:01Z',
    });

    return route.fulfill({ json: { deliveryId: 'test-delivery' } });
  });
  await page.goto('/integrations');
  const feishu = page.getByRole('region', { name: '飞书群机器人', exact: true });

  await expect(feishu.getByRole('button', { name: '发送测试通知' })).toBeDisabled();
  await feishu
    .getByLabel('Webhook 地址', { exact: true })
    .fill('https://open.feishu.cn/open-apis/bot/v2/hook/test-hook');
  await feishu.getByLabel('签名密钥（可选）').fill('test-secret');
  await feishu.getByRole('checkbox', { name: '启用事件通知', exact: true }).check();
  await feishu.getByRole('checkbox', { name: '问题状态变化', exact: true }).check();
  await feishu.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(feishu.getByText('配置已保存。')).toBeVisible();
  await expect(feishu.getByLabel('Webhook 地址', { exact: true })).toHaveValue('');
  await expect(feishu.getByLabel('签名密钥（可选）')).toHaveValue('');
  expect(payloads[0]).toMatchObject({
    enabled: true,
    events: ['run.failed', 'issue.created', 'issue.status_changed'],
    signingSecret: 'test-secret',
  });
  await feishu.getByRole('button', { name: '发送测试通知' }).click();
  await expect(
    page.getByRole('region', { name: '发送记录' }).getByText('已发送 · 1 次尝试'),
  ).toBeVisible();
  await page.reload();
  await expect(feishu.getByLabel('Webhook 地址', { exact: true })).toHaveAttribute(
    'placeholder',
    '已保存，留空保留原地址',
  );
  await feishu.getByRole('checkbox', { name: '启用事件通知', exact: true }).uncheck();
  await expect(feishu.getByRole('button', { name: '发送测试通知' })).toBeDisabled();
  await feishu.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(feishu.getByText('已配置 · 未启用')).toBeVisible();
  expect(payloads[1]).not.toHaveProperty('webhookUrl');
  expect(payloads[1]).not.toHaveProperty('signingSecret');
});

test('configures SMTP recipients, preserves password on later edits and retries failed deliveries', async ({
  page,
}) => {
  const data: IntegrationsResponse = { integrations: structuredClone(defaults), deliveries: [] };
  let lastInput: Record<string, unknown> = {};

  await page.route('**/api/integrations', (route) => route.fulfill({ json: data }));
  await page.route('**/api/integrations/email', (route) => {
    const input = route.request().postDataJSON();

    lastInput = input;
    data.integrations[1] = {
      ...data.integrations[1],
      configured: true,
      version: input.version + 1,
      enabled: input.enabled,
      events: input.events,
      hasPassword: true,
      email: {
        host: input.host,
        port: input.port,
        username: input.username,
        from: input.from,
        recipients: input.recipients,
      },
    };

    return route.fulfill({ json: { integration: data.integrations[1] } });
  });
  await page.route('**/api/integrations/email/test', (route) => {
    data.deliveries.push({
      id: 'failed-delivery',
      channel: 'email',
      title: '测试通知',
      eventType: 'test',
      status: 'failed',
      attempts: 3,
      lastError: 'SMTP 认证失败，请检查账号和授权码。',
      createdAt: '2026-10-01T00:00:00Z',
      sentAt: null,
    });

    return route.fulfill({ json: { deliveryId: 'failed-delivery' } });
  });
  await page.route('**/api/integrations/email/deliveries/failed-delivery/retry', (route) => {
    data.deliveries[0].status = 'pending';
    data.deliveries[0].attempts = 0;
    data.deliveries[0].lastError = null;

    return route.fulfill({ json: { deliveryId: 'failed-delivery' } });
  });
  await page.goto('/integrations');
  const email = page.getByRole('region', { name: 'Email 邮件', exact: true });

  await email.getByLabel('SMTP 服务器', { exact: true }).fill('smtp.example.com');
  await email.getByRole('combobox', { name: 'SMTP 端口与加密' }).click();
  await page.getByRole('option', { name: '587 · STARTTLS', exact: true }).click();
  await email.getByLabel('SMTP 账号', { exact: true }).fill('sender@example.com');
  await email.getByLabel('SMTP 密码或授权码', { exact: true }).fill('test-password');
  await email.getByLabel('发件邮箱', { exact: true }).fill('sender@example.com');
  await email.getByLabel('收件邮箱', { exact: true }).fill('one@example.com, two@example.com');
  await email.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(email.getByText('配置已保存。')).toBeVisible();
  expect(lastInput).toMatchObject({
    port: 587,
    password: 'test-password',
    recipients: ['one@example.com', 'two@example.com'],
  });
  await expect(email.getByLabel('SMTP 密码或授权码', { exact: true })).toHaveValue('');
  await email.getByRole('button', { name: '发送测试通知' }).click();
  const history = page.getByRole('region', { name: '发送记录' });

  await expect(history.getByText('SMTP 认证失败，请检查账号和授权码。')).toBeVisible();
  await history.getByRole('button', { name: '重试', exact: true }).click();
  await expect(history.getByText('待发送 · 0 次尝试')).toBeVisible();
  await email.getByLabel('收件邮箱', { exact: true }).fill('three@example.com');
  await email.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(email.getByText('配置已保存。')).toBeVisible();
  expect(lastInput).not.toHaveProperty('password');
});
