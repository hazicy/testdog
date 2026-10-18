import { test, expect } from './fixtures/test.fixture';
import type { Integration, IntegrationsResponse } from '@testdog/contracts/integrations/types';

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
  integrationsPage,
  workspacePage,
}) => {
  const data: IntegrationsResponse = {
    integrations: structuredClone(defaults),
    deliveries: [],
    emailAvailable: true,
    browserProviders: [
      {
        provider: 'browserless',
        name: 'Browserless',
        description: '远程 Chromium',
        supportedBrowsers: ['chromium'],
        version: 0,
        enabled: false,
        configured: false,
        hasCredentials: false,
      },
    ],
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
  await integrationsPage.goto();
  await expect(page.getByLabel('Webhook 地址', { exact: true })).toHaveCount(0);
  const configure = integrationsPage.configureFeishuButton;

  await configure.click();
  const feishu = integrationsPage.feishuDialog;

  await expect(feishu).toBeVisible();

  await expect(feishu.getByRole('button', { name: '发送测试通知' })).toBeDisabled();
  await feishu
    .getByLabel('Webhook 地址', { exact: true })
    .fill('https://open.feishu.cn/open-apis/bot/v2/hook/test-hook');
  await feishu.getByLabel('签名密钥（可选）').fill('test-secret');
  await feishu.getByRole('checkbox', { name: '启用事件通知', exact: true }).check();
  await feishu.getByRole('checkbox', { name: '问题状态变化', exact: true }).check();
  await feishu.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(
    workspacePage.notifications.getByText('配置已保存。', { exact: true }).last(),
  ).toBeVisible();
  await expect(feishu.getByLabel('Webhook 地址', { exact: true })).toHaveValue('');
  await expect(feishu.getByLabel('签名密钥（可选）')).toHaveValue('');
  expect(payloads[0]).toMatchObject({
    enabled: true,
    events: ['run.failed', 'issue.created', 'issue.status_changed'],
    signingSecret: 'test-secret',
  });
  await feishu.getByRole('button', { name: '发送测试通知' }).click();
  await expect(workspacePage.notifications.getByText('测试通知已提交').last()).toBeVisible();
  await feishu.getByRole('button', { name: '关闭配置' }).click();
  await expect(feishu).toHaveCount(0);
  await expect(configure).toBeFocused();
  await expect(integrationsPage.deliveriesDialog).toHaveCount(0);
  await integrationsPage.openDeliveries();
  const history = integrationsPage.deliveriesDialog;

  await expect(history.getByText('已发送 · 1 次尝试')).toBeVisible();
  await history.getByRole('button', { name: '关闭发送记录' }).click();
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
  integrationsPage,
  workspacePage,
}) => {
  const data: IntegrationsResponse = {
    integrations: structuredClone(defaults),
    deliveries: [],
    emailAvailable: true,
    browserProviders: [
      {
        provider: 'browserless',
        name: 'Browserless',
        description: '远程 Chromium',
        supportedBrowsers: ['chromium'],
        version: 0,
        enabled: false,
        configured: false,
        hasCredentials: false,
      },
    ],
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
  await integrationsPage.goto();
  const configure = integrationsPage.configureEmailButton;

  await configure.click();
  const email = integrationsPage.emailDialog;

  await expect(email.getByLabel(/SMTP|发件邮箱/)).toHaveCount(0);
  await email.getByLabel('收件邮箱', { exact: true }).fill('one@example.com, two@example.com');
  await email.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(
    workspacePage.notifications.getByText('配置已保存。', { exact: true }).last(),
  ).toBeVisible();
  expect(lastInput).toEqual({
    version: 0,
    enabled: false,
    events: ['run.failed', 'issue.created'],
    recipients: ['one@example.com', 'two@example.com'],
  });
  await email.getByRole('button', { name: '发送测试通知' }).click();
  await expect(workspacePage.notifications.getByText('测试通知已提交').last()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(email).toHaveCount(0);
  await expect(configure).toBeFocused();
  const historyButton = integrationsPage.deliveriesButton;

  await historyButton.click();
  const history = integrationsPage.deliveriesDialog;

  await expect(history.getByText('邮件发送失败，请检查收件邮箱或稍后重试。')).toBeVisible();
  await history.getByRole('button', { name: '重试', exact: true }).click();
  await expect(history.getByText('待发送 · 0 次尝试')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(history).toHaveCount(0);
  await expect(historyButton).toBeFocused();
  await configure.click();
  await email.getByLabel('收件邮箱', { exact: true }).fill('three@example.com');
  await email.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(
    workspacePage.notifications.getByText('配置已保存。', { exact: true }).last(),
  ).toBeVisible();
  expect(lastInput).not.toHaveProperty('password');
});

test('saves email preferences while platform mail is unavailable and disables test notifications', async ({
  page,
  workspacePage,
  integrationsPage,
}) => {
  const data: IntegrationsResponse = {
    integrations: structuredClone(defaults),
    deliveries: [],
    emailAvailable: false,
    browserProviders: [
      {
        provider: 'browserless',
        name: 'Browserless',
        description: '远程 Chromium',
        supportedBrowsers: ['chromium'],
        version: 0,
        enabled: false,
        configured: false,
        hasCredentials: false,
      },
    ],
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
  await page.setViewportSize({ width: 390, height: 844 });
  await integrationsPage.goto();
  await expect(page.getByRole('button', { name: '刷新', exact: true })).toHaveCount(0);
  await expect(page.getByText('将执行结果和问题动态发送到团队的沟通渠道。')).toHaveCount(0);
  const historyButton = integrationsPage.deliveriesButton;

  await historyButton.click();
  const history = integrationsPage.deliveriesDialog;

  await expect(history.getByText('暂无发送记录。')).toBeVisible();
  await history.getByRole('button', { name: '关闭发送记录' }).click();
  await expect(historyButton).toBeFocused();
  await integrationsPage.configureEmailButton.click();
  const email = integrationsPage.emailDialog;

  await expect(email.getByText('邮件通知暂不可用，请联系管理员。')).toBeVisible();
  await email.getByLabel('收件邮箱', { exact: true }).fill('recipient@example.com');
  await email.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(
    workspacePage.notifications.getByText('配置已保存。', { exact: true }).last(),
  ).toBeVisible();
  await expect(email.getByRole('button', { name: '发送测试通知' })).toBeDisabled();
  await email.getByRole('button', { name: '关闭配置' }).click();
  await integrationsPage.configureEmailButton.click();
  await expect(email.getByLabel('收件邮箱', { exact: true })).toHaveValue('recipient@example.com');
});

test('outline buttons use the theme border without a persistent outline', async ({
  page,
  integrationsPage,
}) => {
  await page.route('**/api/integrations', (route) =>
    route.fulfill({
      json: {
        integrations: structuredClone(defaults),
        deliveries: [],
        emailAvailable: true,
        browserProviders: [
          {
            provider: 'browserless',
            name: 'Browserless',
            description: '远程 Chromium',
            supportedBrowsers: ['chromium'],
            version: 0,
            enabled: false,
            configured: false,
            hasCredentials: false,
          },
        ],
      },
    }),
  );
  await integrationsPage.goto();
  await integrationsPage.configureFeishuButton.click();
  const dialog = integrationsPage.feishuDialog;
  const button = dialog.getByRole('button', { name: '发送测试通知', exact: true });
  const border = await button.evaluate((element) => {
    const token = getComputedStyle(element).getPropertyValue('--control-line');
    const probe = document.createElement('span');

    probe.style.borderColor = token;

    return probe.style.borderColor;
  });

  await expect(button).toHaveCSS('border-color', border);
  await expect(button).toHaveCSS('border-width', '1px');
  await expect(button).toHaveCSS('outline-style', 'none');
});

test('configures Browserless through generic provider APIs and keeps credentials hidden', async ({
  page,
  integrationsPage,
  workspacePage,
}) => {
  const data: IntegrationsResponse = {
    integrations: structuredClone(defaults),
    deliveries: [],
    emailAvailable: true,
    browserProviders: [
      {
        provider: 'browserless',
        name: 'Browserless',
        description: '远程 Chromium',
        supportedBrowsers: ['chromium'],
        version: 0,
        enabled: false,
        configured: false,
        hasCredentials: false,
      },
    ],
  };
  const payloads: Record<string, unknown>[] = [];

  await page.route('**/api/integrations', (route) => route.fulfill({ json: data }));
  await page.route('**/api/integrations/browser-providers/browserless', (route) => {
    const input = route.request().postDataJSON();

    payloads.push(input);
    data.browserProviders[0] = {
      ...data.browserProviders[0],
      version: input.version + 1,
      enabled: input.enabled,
      configured: true,
      hasCredentials:
        !input.clearToken && (Boolean(input.token) || data.browserProviders[0].hasCredentials),
    };

    return route.fulfill({ json: { integration: data.browserProviders[0] } });
  });
  await page.route('**/api/integrations/browser-providers/browserless/test', (route) =>
    route.fulfill({ json: { success: true, browserVersion: '123.0.0' } }),
  );
  await integrationsPage.goto();
  await integrationsPage.configureBrowserlessButton.click();
  const dialog = integrationsPage.browserlessDialog;

  await expect(dialog.getByRole('button', { name: '测试连接' })).toBeDisabled();
  await dialog.getByLabel('WebSocket 地址', { exact: true }).fill('wss://host/chromium/playwright');
  await dialog.getByLabel('Token（可选）').fill('private-token');
  await dialog.getByRole('checkbox', { name: '启用 Browserless' }).check();
  await dialog.getByRole('button', { name: '保存配置' }).click();
  await expect(workspacePage.notifications.getByText('配置已保存。').last()).toBeVisible();
  await expect(dialog.getByLabel('WebSocket 地址', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Token（可选）')).toHaveValue('');
  expect(payloads[0]).toMatchObject({
    enabled: true,
    token: 'private-token',
    endpoint: 'wss://host/chromium/playwright',
  });
  await dialog.getByRole('button', { name: '测试连接' }).click();
  await expect(workspacePage.notifications.getByText('连接测试成功').last()).toBeVisible();
  await dialog.getByRole('checkbox', { name: '启用 Browserless' }).uncheck();
  await expect(dialog.getByRole('button', { name: '测试连接' })).toBeDisabled();
  await dialog.getByRole('button', { name: '保存配置' }).click();
  await expect(workspacePage.notifications.getByText('配置已保存。').last()).toBeVisible();
  expect(payloads[1]).not.toHaveProperty('endpoint');
  expect(payloads[1]).not.toHaveProperty('token');
  await dialog.getByRole('checkbox', { name: '清除已保存的 Token' }).check();
  await dialog.getByRole('button', { name: '保存配置' }).click();
  await expect(dialog.getByRole('checkbox', { name: '清除已保存的 Token' })).toHaveCount(0);
  await dialog.getByRole('button', { name: '关闭配置' }).click();
  await expect(integrationsPage.configureBrowserlessButton).toBeFocused();
});

test('shows Browserless connection errors and leaves saved configuration editable', async ({
  page,
  integrationsPage,
}) => {
  await page.route('**/api/integrations', (route) =>
    route.fulfill({
      json: {
        integrations: defaults,
        deliveries: [],
        emailAvailable: false,
        browserProviders: [
          {
            provider: 'browserless',
            name: 'Browserless',
            description: '远程 Chromium',
            supportedBrowsers: ['chromium'],
            version: 1,
            enabled: true,
            configured: true,
            hasCredentials: true,
          },
        ],
      },
    }),
  );
  await page.route('**/api/integrations/browser-providers/browserless/test', (route) =>
    route.fulfill({ status: 502, json: { message: '浏览器服务连接测试失败。' } }),
  );
  await integrationsPage.goto();
  await integrationsPage.configureBrowserlessButton.click();
  const dialog = integrationsPage.browserlessDialog;

  await dialog.getByRole('button', { name: '测试连接' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('浏览器服务连接测试失败。');
  await expect(dialog.getByRole('button', { name: '保存配置' })).toBeEnabled();
});
