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
      const { secrets, ...input } = route.request().postDataJSON();

      data.identities.push(
        profile({
          ...input,
          configuredSecrets: Object.keys(secrets ?? {}),
          id: identityId,
          version: input.version + 1,
          status: 'unverified',
        }),
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

  return dialog;
}

async function finishChecks(dialog: import('@playwright/test').Locator) {
  await dialog.getByRole('button', { name: '下一步' }).click();
  await dialog.getByLabel('登录后验证页面').fill('https://app.example/account');
  await dialog.getByLabel('登录成功标志（页面文字）').fill('退出登录');
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
  await dialog.getByRole('button', { name: '下一步' }).click();
  await expect(dialog.getByLabel('密码', { exact: true })).toHaveAttribute('type', 'password');
  await dialog.getByLabel('密码', { exact: true }).fill('user-entered-password');
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain(
    'user-entered-password',
  );
  await dialog.getByLabel('账号', { exact: true }).fill('another-admin');
  await finishChecks(dialog);
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
  await expect(page.getByRole('button', { name: '订单测试', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '删除', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '清除登录态' }).click();
  await expect(page.getByRole('status')).toHaveText('登录态已清除，下次执行会重新登录。');
});
test('keeps saved passwords blank when editing and submits replacements only when entered', async ({
  page,
}) => {
  const data = await catalog(page, [
    profile({
      inputs: { username: { value: 'admin' }, password: { secretRef: 'IDENTITY_SAVED' } },
      configuredSecrets: ['password'],
    }),
  ]);
  const requests: { secrets: Record<string, string> }[] = [];

  await page.route('**/api/login-identities/*/verify', (route) =>
    route.fulfill({ status: 202, json: { runId: 'verification-run' } }),
  );

  await page.route(`**/api/login-identities/${identityId}`, (route) => {
    const { secrets, ...input } = route.request().postDataJSON();

    requests.push({ secrets });
    data.identities[0] = profile({
      ...input,
      configuredSecrets: ['password'],
      version: input.version + 1,
    });

    return route.fulfill({ json: { identity: data.identities[0] } });
  });
  await page.goto('/settings#login-identities');
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '编辑登录身份' });

  await dialog.getByRole('button', { name: '下一步' }).click();
  await expect(dialog.getByLabel('密码', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('密码', { exact: true })).toHaveAttribute(
    'placeholder',
    '已保存，留空保持不变',
  );
  await finishChecks(dialog);
  await dialog.getByRole('button', { name: '保存并验证' }).click();
  await expect(dialog).toHaveCount(0);
  expect(requests[0].secrets).toEqual({});
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await dialog.getByRole('button', { name: '下一步' }).click();
  await dialog.getByLabel('密码', { exact: true }).fill('replacement-password');
  await finishChecks(dialog);
  await dialog.getByRole('button', { name: '保存并验证' }).click();
  await expect(dialog).toHaveCount(0);
  expect(requests[1].secrets).toEqual({ password: 'replacement-password' });
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain(
    'replacement-password',
  );
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
  await page.getByRole('option', { name: '测试管理员 · 可复用', exact: true }).click();
  await expect(
    page.getByText('可复用 · 登录验证成功，可在用例中使用。', { exact: true }),
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
  await page.getByRole('button', { name: '保存并返回', exact: true }).click();
  await expect(page).toHaveURL(/\/settings/);
  const dialog = page.getByRole('dialog', { name: '新建登录身份' });

  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('密码', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '上一步' }).click();
  await expect(dialog.getByLabel('身份名称', { exact: true })).toHaveValue('测试管理员');
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
  await dialog.getByRole('button', { name: '下一步' }).click();
  await dialog.getByLabel('密码', { exact: true }).fill('user-entered-password');
  await finishChecks(dialog);
  await dialog.getByRole('button', { name: '保存并验证' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('登录身份', { exact: true })).toContainText('测试管理员');
  expect(savedCases).toBe(0);
  await expect(page).toHaveURL(/\/cases\/editor\/inline$/);
});

test('saves without verification and retries a failed verification without creating another identity', async ({
  page,
}) => {
  const data = await catalog(page);
  let verificationRequests = 0;

  await page.route('**/api/login-identities/*/verify', (route) => {
    verificationRequests++;
    if (verificationRequests === 1)
      return route.fulfill({ status: 503, json: { message: '队列暂不可用。' } });
    data.identities[0].status = 'verifying';
    data.identities[0].verificationRunId = 'retry-run';

    return route.fulfill({ status: 202, json: { runId: 'retry-run' } });
  });
  await page.goto('/settings#login-identities');
  await page.getByRole('button', { name: '新建登录身份', exact: true }).click();
  const dialog = await fillProfile(page);

  await dialog.getByLabel('登录流程', { exact: true }).click();
  await page.getByRole('option', { name: '登录流程', exact: true }).click();
  await dialog.getByRole('button', { name: '下一步' }).click();
  await dialog.getByLabel('密码', { exact: true }).fill('retry-password');
  await finishChecks(dialog);
  await dialog.getByRole('button', { name: '保存并验证' }).click();
  const savedDialog = page.getByRole('dialog', { name: '编辑登录身份' });

  await expect(savedDialog.getByRole('alert')).toContainText('配置已保存。队列暂不可用。');
  await savedDialog.getByRole('button', { name: '重试验证' }).click();
  await expect(savedDialog).toHaveCount(0);
  expect(data.identities).toHaveLength(1);
  expect(data.identities[0].version).toBe(1);
  expect(verificationRequests).toBe(2);
  await expect(page.getByRole('link', { name: '查看验证执行' })).toHaveAttribute(
    'href',
    '/runs/retry-run',
  );
});

test('supports saving an unverified identity without submitting a run', async ({ page }) => {
  const data = await catalog(page);
  let verifies = 0;

  await page.route('**/api/login-identities/*/verify', (route) => {
    verifies++;

    return route.fulfill({ status: 202, json: { runId: 'unexpected' } });
  });
  await page.goto('/settings#login-identities');
  await page.getByRole('button', { name: '新建登录身份', exact: true }).click();
  const dialog = await fillProfile(page);

  await dialog.getByLabel('登录流程', { exact: true }).click();
  await page.getByRole('option', { name: '登录流程', exact: true }).click();
  await dialog.getByRole('button', { name: '下一步' }).click();
  await dialog.getByLabel('密码', { exact: true }).fill('save-only-password');
  await finishChecks(dialog);
  await dialog.getByRole('button', { name: '仅保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('尚未验证', { exact: true })).toBeVisible();
  expect(data.identities).toHaveLength(1);
  expect(verifies).toBe(0);
});

test('discards password drafts when switching to a flow without that input', async ({ page }) => {
  const data = await catalog(page);

  data.flows.push({
    ...flow,
    id: '00000000-0000-4000-8000-000000000004',
    name: '免密码流程',
    target: { ...flow.target!, inputs: { username: { value: '' } } },
  });
  let submittedSecrets: unknown;

  await page.route('**/api/login-identities', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: data });
    const { secrets, ...input } = route.request().postDataJSON();

    submittedSecrets = secrets;
    data.identities.push(profile({ ...input, status: 'unverified' }));

    return route.fulfill({ status: 201, json: { identity: data.identities[0] } });
  });
  await page.goto('/settings#login-identities');
  await page.getByRole('button', { name: '新建登录身份', exact: true }).click();
  const dialog = await fillProfile(page);

  await dialog.getByLabel('登录流程', { exact: true }).click();
  await page.getByRole('option', { name: '登录流程', exact: true }).click();
  await dialog.getByRole('button', { name: '下一步' }).click();
  await dialog.getByLabel('密码', { exact: true }).fill('discard-this-password');
  await dialog.getByRole('button', { name: '上一步' }).click();
  await dialog.getByLabel('登录流程', { exact: true }).click();
  await page.getByRole('option', { name: '免密码流程', exact: true }).click();
  await dialog.getByRole('button', { name: '下一步' }).click();
  await expect(dialog.getByLabel('密码', { exact: true })).toHaveCount(0);
  await finishChecks(dialog);
  await dialog.getByRole('button', { name: '仅保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(submittedSecrets).toEqual({});
  expect(JSON.stringify(data.identities[0].inputs)).not.toContain('password');
});

test('edits login inputs and inserts readable references in the shared canvas', async ({
  page,
}) => {
  const data = await catalog(page);
  let saved: TestCase | undefined;

  await page.route(`**/api/tests/${flowId}`, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { test: flow } });
    saved = { ...flow, ...route.request().postDataJSON() };
    data.flows[0] = saved!;

    return route.fulfill({ json: { test: saved } });
  });
  await page.goto('/settings#login-identities');
  await page.getByRole('button', { name: '新建登录身份', exact: true }).click();
  await fillProfile(page);
  await page.getByLabel('登录流程', { exact: true }).click();
  await page.getByRole('option', { name: '登录流程', exact: true }).click();
  await page.getByRole('button', { name: '编辑登录流程', exact: true }).click();
  await expect(page.getByLabel('输入引用（JSON，可选）')).toHaveCount(0);
  await expect(page.getByLabel('登录身份', { exact: true })).toHaveCount(0);
  await page.getByLabel('输入名称 密码', { exact: true }).fill('登录密码');
  await page.getByRole('button', { name: '添加输入', exact: true }).click();
  await page.getByLabel('输入名称 输入 1', { exact: true }).fill('验证码');
  await page.getByLabel('验证码类型').click();
  await page.getByRole('option', { name: '密码 / 敏感输入', exact: true }).click();
  await page.getByRole('button', { name: '编辑节点 login', exact: true }).click();
  const node = page.getByLabel('节点内容 login', { exact: true });

  await node.fill('在密码框输入 ');
  await page.getByRole('button', { name: '插入 登录密码', exact: true }).click();
  await expect(node).toHaveValue('在密码框输入 〔登录密码〕');
  await node.press('Enter');
  await page.getByRole('button', { name: '描述调整', exact: true }).click();
  await page.getByLabel('测试步骤与预期结果').fill('');
  await page.getByRole('button', { name: '插入 验证码', exact: true }).click();
  await expect(page.getByLabel('测试步骤与预期结果')).toHaveValue('〔验证码〕');
  await page.getByRole('button', { name: '关闭描述输入', exact: true }).click();
  await page.getByRole('button', { name: '保存并返回', exact: true }).click();
  await expect(page).toHaveURL(/\/settings/);
  expect(saved?.plan?.nodes.login).toMatchObject({ goal: '在密码框输入 ${input.password}' });
  expect(saved?.target?.inputs?.field1).toMatchObject({
    label: '验证码',
    secretRef: 'LOGIN_FIELD1',
  });
  const dialog = page.getByRole('dialog', { name: '新建登录身份' });

  await expect(dialog.getByLabel('登录密码', { exact: true })).toHaveAttribute('type', 'password');
  await expect(dialog.getByLabel('验证码', { exact: true })).toHaveAttribute('type', 'password');
});

test('cancels the login canvas back to the identity without saving changes', async ({ page }) => {
  await catalog(page);
  let saves = 0;

  await page.route('**/api/tests', (route) => {
    saves++;

    return route.fulfill({ json: { test: flow } });
  });
  await page.goto('/settings#login-identities');
  await page.getByRole('button', { name: '新建登录身份', exact: true }).click();
  await fillProfile(page);
  await page.getByRole('button', { name: '新建登录流程', exact: true }).click();
  await page.getByRole('button', { name: '取消并返回', exact: true }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByLabel('身份名称', { exact: true })).toHaveValue('测试管理员');
  expect(saves).toBe(0);
});

test('confirms deletion and supports opening an identity directly for repair', async ({ page }) => {
  const data = await catalog(page, [profile()]);

  await page.route(`**/api/login-identities/${identityId}`, (route) => {
    data.identities = [];

    return route.fulfill({ json: { success: true } });
  });
  await page.goto(`/settings?loginIdentity=${identityId}#login-identities`);
  await expect(page.getByRole('dialog', { name: '编辑登录身份' })).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '删除登录身份？' })).toBeVisible();
  expect(data.identities).toHaveLength(1);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(data.identities).toHaveLength(1);
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(data.identities).toHaveLength(0);
});

test('returns server input errors to the matching step with an edit-flow action', async ({
  page,
}) => {
  const data = await catalog(page);

  await page.route('**/api/login-identities', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: data });

    return route.fulfill({
      status: 400,
      json: {
        message: '密码与登录流程不匹配。',
        fieldErrors: { 'inputs.password': '请编辑流程，将密码设置为敏感输入。' },
      },
    });
  });
  await page.goto('/settings#login-identities');
  await page.getByRole('button', { name: '新建登录身份', exact: true }).click();
  const dialog = await fillProfile(page);

  await dialog.getByLabel('登录流程', { exact: true }).click();
  await page.getByRole('option', { name: '登录流程', exact: true }).click();
  await dialog.getByRole('button', { name: '下一步' }).click();
  await dialog.getByLabel('密码', { exact: true }).fill('field-error-password');
  await finishChecks(dialog);
  await dialog.getByRole('button', { name: '保存并验证' }).click();
  await expect(dialog.getByLabel('密码', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(
    dialog.getByText('请编辑流程，将密码设置为敏感输入。', { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: '编辑登录流程', exact: true })).toBeVisible();
  expect(data.identities).toHaveLength(0);
});

test('preserves the source business case when creating a login flow from its settings', async ({
  page,
}) => {
  const data = await catalog(page);

  await page.route('**/api/tests', (route) => {
    const input = route.request().postDataJSON();
    const saved = { ...input, id: '00000000-0000-4000-8000-000000000003' };

    data.flows.push(saved);

    return route.fulfill({ json: { test: saved } });
  });
  await page.goto('/settings');
  await page.evaluate(
    ({ plan, settings }) =>
      sessionStorage.setItem(
        'caseforge:case-draft:source-business',
        JSON.stringify({
          name: '未保存的订单用例',
          url: 'https://app.example/orders',
          goal: '检查订单',
          plan,
          settings,
        }),
      ),
    {
      plan: flow.plan,
      settings: {
        ...initialCaseSettings(),
        url: 'https://app.example/orders',
        webProfile: 'legacy-desktop',
      },
    },
  );
  await page.goto('/cases/editor/source-business');
  await page.getByRole('button', { name: '展开面板', exact: true }).click();
  await page.getByLabel('登录身份', { exact: true }).click();
  await page.getByRole('option', { name: '＋ 新建登录身份', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建登录身份' });

  await dialog.getByLabel('身份名称', { exact: true }).fill('订单账号');
  await dialog.getByRole('button', { name: '新建登录流程', exact: true }).click();
  await expect(page).toHaveURL(/\/cases\/editor\/[0-9a-f-]+$/);
  await page.evaluate((plan) => {
    const key = `caseforge:case-draft:${window.location.pathname.split('/').at(-1)}`;
    const draft = JSON.parse(sessionStorage.getItem(key)!);

    sessionStorage.setItem(key, JSON.stringify({ ...draft, goal: '登录', plan }));
  }, flow.plan);
  await page.reload();
  await page.getByRole('button', { name: '保存并返回', exact: true }).click();
  await expect(page).toHaveURL(/\/cases\/editor\/source-business/);
  await expect(dialog.getByLabel('密码', { exact: true })).toBeVisible();
  await dialog.getByLabel('账号', { exact: true }).fill('business-user');
  await dialog.getByLabel('密码', { exact: true }).fill('business-password');
  await finishChecks(dialog);
  await dialog.getByRole('button', { name: '仅保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('测试名称', { exact: true })).toHaveValue('未保存的订单用例');
  await expect(page.getByLabel('网站地址', { exact: true })).toHaveValue(
    'https://app.example/orders',
  );
  await expect(page.getByLabel('登录身份', { exact: true })).toContainText('订单账号');
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain(
    'business-password',
  );
});

test('shows login preparation failure details and submits a separate verification', async ({
  page,
}) => {
  await catalog(page, [profile({ status: 'failed', lastError: '成功标志未出现' })]);
  const runId = '00000000-0000-4000-8000-000000000009';
  const run: import('../../src/features/runs/types').TestRun = {
    id: runId,
    name: '订单测试',
    url: 'https://app.example/orders',
    goal: '检查订单',
    mode: 'record',
    status: 'failed',
    startedAt: '2026-10-12T00:00:00Z',
    finishedAt: '2026-10-12T00:00:01Z',
    replayable: false,
    cancelRequested: false,
    steps: [],
    artifacts: [],
    events: [{ at: '2026-10-12T00:00:01Z', message: '登录准备失败：成功标志未出现' }],
    errorCode: 'LOGIN_PREPARATION_FAILED',
    targetSnapshot: {
      schemaVersion: 1,
      platform: 'web',
      browser: 'chromium',
      deviceProfile: 'legacy-desktop',
      url: 'https://app.example/orders',
      loginIdentityId: identityId,
    },
  };

  await page.route(`**/api/runs/${runId}{,?*}`, (route) => route.fulfill({ json: { run } }));
  await page.route('**/api/issues?*', (route) =>
    route.fulfill({ json: { issues: [], nextCursor: null } }),
  );
  await page.route('**/model-usage', (route) =>
    route.fulfill({
      json: {
        usage: {
          calls: 0,
          failures: 0,
          retries: 0,
          durationMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          unknownUsage: 0,
        },
        calls: [],
      },
    }),
  );
  await page.goto(`/runs/${runId}`);
  await expect(page.getByText('失败，业务步骤未开始。', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: '修正登录身份', exact: true })).toHaveAttribute(
    'href',
    `/settings?loginIdentity=${identityId}#login-identities`,
  );
  await page.getByRole('button', { name: '查看失败信息', exact: true }).click();
  await expect(page.getByLabel('执行日志内容', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重新验证', exact: true }).click();
  await expect(page.getByRole('link', { name: '查看验证执行', exact: true })).toHaveAttribute(
    'href',
    '/runs/verification-run',
  );
  expect(run.steps).toHaveLength(0);
});
