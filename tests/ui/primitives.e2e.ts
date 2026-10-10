import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/workspace/stats', route => route.fulfill({ json: { testCount: 1, runCount: 1, counts: { queued: 0, preparing: 0, running: 0, finalizing: 0, passed: 1, failed: 0, cancelled: 0 } } }));
  await page.route('**/model-usage', route => route.fulfill({ json: { usage: { calls: 0, failures: 0, retries: 0, durationMs: 0, inputTokens: 0, outputTokens: 0, unknownUsage: 0 }, calls: [] } }));
  await page.route( /\/api\/tests(?:\?.*)?$/, (route) => route.fulfill({ json: { tests: [] } }));
  await page.route( /\/api\/runs(?:\?.*)?$/, (route) => route.fulfill({ json: { runs: [] } }));
  await page.route('**/api/builds', (route) => route.fulfill({ json: { builds: [] } }));
  await page.route('**/api/resources', (route) =>
    route.fulfill({
      json: {
        resources: [
          { id: 'phone', platform: 'ios', profileId: 'iphone-fixture', status: 'available' },
        ],
      },
    }),
  );
});

test('select keyboard navigation and Escape stay within the editor dialog', async ({ page }) => {
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  const platform = dialog.getByRole('combobox', { name: '平台', exact: true });

  await platform.focus();
  await platform.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(platform).toContainText('iOS');
  await expect(dialog.getByLabel('应用标识', { exact: true })).toBeVisible();
  await platform.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(platform).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新建测试', exact: true }).first()).toBeFocused();
});

test('native setup validates required selection and submits custom checkbox values', async ({
  page,
}) => {
  let submitted: Record<string, unknown> | undefined;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route( /\/api\/tests(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { tests: [] } });
    submitted = route.request().postDataJSON();
    await pending;
    await route.fulfill({ json: { test: submitted } });
  });
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).first().click();
  const dialog = page.getByRole('dialog');

  await dialog.getByLabel('测试名称', { exact: true }).fill('Native setup');
  await dialog.getByLabel('平台', { exact: true }).click();
  await page.getByRole('option', { name: 'iOS · 原生应用', exact: true }).click();
  await dialog.getByLabel('应用标识', { exact: true }).fill('com.example.fixture');
  await dialog.getByLabel('测试步骤与预期结果', { exact: true }).fill('Verify welcome');
  await dialog.getByRole('button', { name: '保存测试', exact: true }).click();
  await expect(dialog.getByLabel('设备配置', { exact: true })).toBeFocused();
  expect(submitted).toBeUndefined();
  await dialog.getByLabel('设备配置', { exact: true }).click();
  await page.getByRole('option', { name: 'iphone-fixture · 可用', exact: true }).click();
  const video = dialog.getByRole('checkbox', { name: '视频', exact: true });

  await video.focus();
  await video.press('Space');
  await expect(video).toBeChecked();
  await dialog.getByRole('button', { name: '保存测试', exact: true }).click();
  await expect(dialog).toHaveAttribute('aria-busy', 'true');
  await expect(video).toBeDisabled();
  await expect(dialog.getByLabel('平台', { exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(submitted).toMatchObject({
    target: {
      platform: 'ios',
      deviceProfileId: 'iphone-fixture',
      evidence: { video: true, trace: false, logs: false },
    },
  });
  release();
  await expect(dialog).toHaveCount(0);
});

test('example tabs navigate with arrow keys and expose the matching panel', async ({ page }) => {
  await page.goto('/');
  const tabs = page.getByRole('tablist', { name: '用例示例' });

  await tabs.getByRole('tab', { name: '登录验证', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: '表单提交', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tabpanel')).toContainText('app.example.com/contact');
  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab', { name: '页面导航', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toContainText('app.example.com/settings');
});
