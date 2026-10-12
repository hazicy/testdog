import { expect, test } from '@playwright/test';
import type {
  LoginIdentitiesResponse,
  LoginIdentity,
} from '../../src/features/login-identities/types';
import type { TestCase } from '../../src/features/test-cases/types';
import { initialCaseSettings } from '../../src/features/test-cases/lib/caseSettings';

const flowId = '00000000-0000-4000-8000-000000000001';
const identityId = '00000000-0000-4000-8000-000000000002';
const profile = (patch: Partial<LoginIdentity> = {}): LoginIdentity => ({
  id: identityId,
  name: '测试管理员',
  website: 'https://app.example',
  loginTestId: flowId,
  checkUrl: 'https://app.example/account',
  successText: '退出登录',
  inputs: {},
  ttlMinutes: 60,
  version: 1,
  status: 'ready',
  lastVerifiedAt: '2026-10-12T00:00:00Z',
  lastError: null,
  verificationRunId: null,
  references: [],
  ...patch,
});
const flow: TestCase = {
  id: flowId,
  name: '登录流程',
  url: 'https://app.example/login',
  goal: '登录',
  tags: [],
  createdAt: '2026-10-12T00:00:00Z',
  updatedAt: '2026-10-12T00:00:00Z',
  target: {
    schemaVersion: 1,
    platform: 'web',
    browser: 'chromium',
    deviceProfile: 'legacy-desktop',
    url: 'https://app.example/login',
    inputs: { username: { value: 'admin' }, password: { secretRef: 'LOGIN_PASSWORD' } },
  },
  plan: {
    rootId: 'login',
    nodes: {
      login: {
        id: 'login',
        kind: 'task',
        actionType: 'login',
        goal: '登录',
        dependsOn: [],
        requirementIds: [],
        assertions: [],
      },
    },
  },
};

async function catalog(page: import('@playwright/test').Page, identities: LoginIdentity[] = []) {
  const data: LoginIdentitiesResponse = { identities, flows: [flow] };

  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'alice', name: 'Alice', email: 'alice@example.com' },
        session: { id: 'session', userId: 'alice', expiresAt: '2099-01-01T00:00:00Z' },
      },
    }),
  );
  await page.route('**/api/auth/list-accounts', (route) =>
    route.fulfill({ json: [{ providerId: 'credential' }] }),
  );
  await page.route('**/api/login-identities', async (route) => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON();

      data.identities.push(
        profile({ ...input, id: identityId, version: input.version + 1, status: 'unverified' }),
      );

      return route.fulfill({ status: 201, json: { identity: data.identities.at(-1) } });
    }

    return route.fulfill({ json: data });
  });
  await page.route('**/api/login-identities/*/verify', (route) => {
    data.identities[0].status = 'verifying';
    data.identities[0].verificationRunId = 'verification-run';

    return route.fulfill({ status: 202, json: { runId: 'verification-run' } });
  });
  await page.route('**/api/login-identities/*/cache', (route) => {
    data.identities[0].status = 'unverified';

    return route.fulfill({ json: { success: true } });
  });
  await page.route('**/api/builds', (route) => route.fulfill({ json: { builds: [] } }));
  await page.route('**/api/resources', (route) => route.fulfill({ json: { resources: [] } }));
  await page.route('**/api/tests/*', (route) => route.fulfill({ json: { test: flow } }));

  return data;
}

async function fillProfile(page: import('@playwright/test').Page) {
  const dialog = page.getByRole('dialog', { name: '新建登录身份' });

  await dialog.getByLabel('身份名称', { exact: true }).fill('测试管理员');
  await dialog.getByLabel('网站', { exact: true }).fill('https://app.example');
  await dialog.getByLabel('登录后验证页面').fill('https://app.example/account');
  await dialog.getByLabel('登录成功标志（页面文字）').fill('退出登录');

  return dialog;
}

test('creates an identity, configures account references and queues verification', async ({
  page,
}) => {
  const data = await catalog(page);

  await page.goto('/settings#login-identities');
  await page.getByRole('button', { name: '新建登录身份', exact: true }).click();
  const dialog = await fillProfile(page);

  await dialog.getByLabel('登录流程', { exact: true }).click();
  await page.getByRole('option', { name: '登录流程', exact: true }).click();
  await expect(dialog.getByLabel('password（密钥名称）')).toHaveValue('LOGIN_PASSWORD');
  await dialog.getByLabel('username', { exact: true }).fill('another-admin');
  await dialog.getByRole('button', { name: '保存并验证' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('正在验证', { exact: true })).toBeVisible();
  expect(data.identities[0].inputs).toEqual({
    username: { value: 'another-admin' },
    password: { secretRef: 'LOGIN_PASSWORD' },
  });
  await expect(page.getByRole('link', { name: '查看验证执行' })).toHaveAttribute(
    'href',
    '/runs/verification-run',
  );
});
test('shows references and prevents deletion while an identity is in use', async ({ page }) => {
  await catalog(page, [profile({ references: [{ id: 'business', name: '订单测试' }] })]);
  await page.goto('/settings#login-identities');
  await expect(page.getByText('关联用例：订单测试')).toBeVisible();
  await expect(page.getByRole('button', { name: '删除', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '清除登录态' }).click();
  await expect(page.getByRole('status')).toHaveText('登录态已清除，下次执行会重新登录。');
});
test('selects an identity in case settings and preserves it in the saved target', async ({
  page,
}) => {
  await catalog(page, [profile()]);
  let saved: Record<string, unknown> | undefined;

  await page.route('**/api/tests', (route) => {
    if (route.request().method() !== 'POST')
      return route.fulfill({ json: { tests: [], nextCursor: null } });
    saved = route.request().postDataJSON();

    return route.fulfill({ json: { test: { ...saved, id: 'business' } } });
  });
  await page.goto('/settings');
  await page.evaluate(
    ({ flow, settings }) => {
      sessionStorage.setItem(
        'caseforge:case-draft:business',
        JSON.stringify({
          name: '订单测试',
          url: 'https://app.example/orders',
          goal: '检查订单',
          plan: flow.plan,
          settings,
        }),
      );
    },
    {
      flow,
      settings: {
        ...initialCaseSettings(),
        url: 'https://app.example/orders',
        webProfile: 'legacy-desktop',
      },
    },
  );
  await page.goto('/cases/editor/business');
  await page.getByRole('button', { name: '展开面板', exact: true }).click();
  await page.getByLabel('登录身份', { exact: true }).click();
  await page.getByRole('option', { name: '测试管理员', exact: true }).click();
  await expect(
    page.getByText('执行前自动准备登录，失效时重新登录。', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/cases$/);
  expect(saved?.target).toMatchObject({ loginIdentityId: identityId });
});
test('opens the shared canvas for a new login flow and returns with the identity draft intact', async ({
  page,
}) => {
  const data = await catalog(page);

  await page.route('**/api/tests', (route) => {
    const input = route.request().postDataJSON();
    const saved = { ...input, id: '00000000-0000-4000-8000-000000000003' };

    data.flows.push(saved);

    return route.fulfill({ json: { test: saved } });
  });
  await page.goto('/settings#login-identities');
  await page.getByRole('button', { name: '新建登录身份', exact: true }).click();
  await fillProfile(page);
  await page.getByRole('button', { name: '新建登录流程' }).click();
  await expect(page).toHaveURL(/\/cases\/editor\//);
  // Supply the completed canvas draft, exercising the actual save and return path.
  await page.evaluate((plan) => {
    const key = `caseforge:case-draft:${window.location.pathname.split('/').at(-1)}`;
    const draft = JSON.parse(sessionStorage.getItem(key)!);

    sessionStorage.setItem(key, JSON.stringify({ ...draft, goal: '登录', plan }));
  }, flow.plan);
  await page.reload();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/settings/);
  const dialog = page.getByRole('dialog', { name: '新建登录身份' });

  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('身份名称', { exact: true })).toHaveValue('测试管理员');
  await expect(dialog.getByLabel('登录成功标志（页面文字）')).toHaveValue('退出登录');
  await expect(dialog.getByLabel('登录流程', { exact: true })).toContainText(
    '测试管理员 · 登录流程',
  );
});

test('creates an identity from case settings without submitting the enclosing case', async ({
  page,
}) => {
  await catalog(page);
  let savedCases = 0;

  await page.route('**/api/tests', (route) => {
    savedCases++;

    return route.fulfill({ json: { test: flow } });
  });
  await page.goto('/settings');
  await page.evaluate(
    ({ plan, settings }) => {
      sessionStorage.setItem(
        'caseforge:case-draft:inline',
        JSON.stringify({
          name: '订单测试',
          url: 'https://app.example/orders',
          goal: '检查订单',
          plan,
          settings,
        }),
      );
    },
    {
      plan: flow.plan,
      settings: {
        ...initialCaseSettings(),
        url: 'https://app.example/orders',
        webProfile: 'legacy-desktop',
      },
    },
  );
  await page.goto('/cases/editor/inline');
  await page.getByRole('button', { name: '展开面板', exact: true }).click();
  await page.getByLabel('登录身份', { exact: true }).click();
  await page.getByRole('option', { name: '＋ 新建登录身份', exact: true }).click();
  const dialog = await fillProfile(page);

  await dialog.getByLabel('登录流程', { exact: true }).click();
  await page.getByRole('option', { name: '登录流程', exact: true }).click();
  await dialog.getByRole('button', { name: '保存并验证' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('登录身份', { exact: true })).toContainText('测试管理员');
  expect(savedCases).toBe(0);
  await expect(page).toHaveURL(/\/cases\/editor\/inline$/);
});
