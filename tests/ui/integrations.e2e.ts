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
  },
  {
    channel: 'email',
    version: 0,
    enabled: false,
    events: [],
    configured: false,
    hasSigningSecret: false,
  },
];

test('configures Feishu, keeps saved secrets hidden and shows queued test delivery', async ({
  page,
}) => {
  const data: IntegrationsResponse = {
    integrations: structuredClone(defaults),
    deliveries: [],
    emailAvailable: true,
  };
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
  await expect(page.getByLabel('Webhook 地址', { exact: true })).toHaveCount(0);
  const configure = page.getByRole('button', { name: '配置飞书群机器人', exact: true });

  await configure.click();
  const feishu = page.getByRole('dialog', { name: '飞书群机器人', exact: true });

  await expect(feishu).toBeVisible();

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
  await expect(feishu.getByRole('status')).toContainText('测试通知已提交');
  await feishu.getByRole('button', { name: '关闭配置' }).click();
  await expect(feishu).toHaveCount(0);
  await expect(configure).toBeFocused();
  await expect(
    page.getByRole('region', { name: '发送记录' }).getByText('已发送 · 1 次尝试'),
  ).toBeVisible();
  await page.reload();
  await configure.click();
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

test('configures email recipients without SMTP fields and retries failed deliveries', async ({
  page,
}) => {
  const data: IntegrationsResponse = {
    integrations: structuredClone(defaults),
    deliveries: [],
    emailAvailable: true,
  };
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
      email: {
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
      lastError: '邮件发送失败，请检查收件邮箱或稍后重试。',
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
  const configure = page.getByRole('button', { name: '配置Email 邮件', exact: true });

  await configure.click();
  const email = page.getByRole('dialog', { name: 'Email 邮件', exact: true });

  await expect(email.getByLabel(/SMTP|发件邮箱/)).toHaveCount(0);
  await email.getByLabel('收件邮箱', { exact: true }).fill('one@example.com, two@example.com');
  await email.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(email.getByText('配置已保存。')).toBeVisible();
  expect(lastInput).toEqual({
    version: 0,
    enabled: false,
    events: ['run.failed', 'issue.created'],
    recipients: ['one@example.com', 'two@example.com'],
  });
  await email.getByRole('button', { name: '发送测试通知' }).click();
  await expect(email.getByRole('status')).toContainText('测试通知已提交');
  await page.keyboard.press('Escape');
  await expect(email).toHaveCount(0);
  await expect(configure).toBeFocused();
  const history = page.getByRole('region', { name: '发送记录' });

  await expect(history.getByText('邮件发送失败，请检查收件邮箱或稍后重试。')).toBeVisible();
  await history.getByRole('button', { name: '重试', exact: true }).click();
  await expect(history.getByText('待发送 · 0 次尝试')).toBeVisible();
  await configure.click();
  await email.getByLabel('收件邮箱', { exact: true }).fill('three@example.com');
  await email.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(email.getByText('配置已保存。')).toBeVisible();
  expect(lastInput).not.toHaveProperty('password');
});

test('saves email preferences while platform mail is unavailable and disables test notifications', async ({
  page,
}) => {
  const data: IntegrationsResponse = {
    integrations: structuredClone(defaults),
    deliveries: [],
    emailAvailable: false,
  };

  await page.route('**/api/integrations', (route) => route.fulfill({ json: data }));
  await page.route('**/api/integrations/email', (route) => {
    const input = route.request().postDataJSON();

    data.integrations[1] = {
      ...data.integrations[1],
      configured: true,
      version: input.version + 1,
      enabled: input.enabled,
      events: input.events,
      email: { recipients: input.recipients },
    };

    return route.fulfill({ json: { integration: data.integrations[1] } });
  });
  await page.goto('/integrations');
  await page.getByRole('button', { name: '配置Email 邮件', exact: true }).click();
  const email = page.getByRole('dialog', { name: 'Email 邮件', exact: true });

  await expect(email.getByText('邮件通知暂不可用，请联系管理员。')).toBeVisible();
  await email.getByLabel('收件邮箱', { exact: true }).fill('recipient@example.com');
  await email.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(email.getByText('配置已保存。')).toBeVisible();
  await expect(email.getByRole('button', { name: '发送测试通知' })).toBeDisabled();
  await email.getByRole('button', { name: '关闭配置' }).click();
  await page.getByRole('button', { name: '配置Email 邮件', exact: true }).click();
  await expect(email.getByLabel('收件邮箱', { exact: true })).toHaveValue('recipient@example.com');
});
