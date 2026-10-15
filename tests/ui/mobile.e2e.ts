import { expect, test, type Locator, type Page } from '@playwright/test';
import { makeCase, makeRun, makeScreenshot, summarizeRun } from './fixtures/workspace';
import { mockLists, mockRun, mockScreenshots, mockWorkspaceSupport } from './fixtures/routes';

const saved = makeCase();
const run = makeRun({
  plan: {
    rootId: 'visit',
    nodes: {
      visit: {
        id: 'visit',
        kind: 'task',
        goal: '打开网站',
        dependsOn: [],
        requirementIds: [],
        assertions: [],
      },
    },
  },
});
const issue = {
  id: saved.id,
  title: '订单金额错误',
  description: '预期 100，实际 120',
  status: 'open',
  category: 'product',
  severity: 'high',
  closeReason: null,
  version: 1,
  createdAt: run.startedAt,
  updatedAt: run.startedAt,
};

async function fitsPage(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
}

async function fitsRegion(region: Locator) {
  await expect(region).toBeVisible();
  expect(await region.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
}

test.use({ isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await mockWorkspaceSupport(page);
  await mockLists(page, { tests: [saved], latestRuns: [summarizeRun(run)] });
  await mockLists(page, { runs: [summarizeRun(run)] });
  await mockRun(page, { ...run, artifacts: [makeScreenshot(run)] });
  await mockScreenshots(page, run.id);
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: null }));
  await page.route(`**/api/runs/${run.id}/recording`, (route) =>
    route.fulfill({ json: { versions: [] } }),
  );
  await page.route(`**/api/runs/${run.id}/logs?*`, (route) =>
    route.fulfill({ json: { logs: [], nextCursor: null } }),
  );
  await page.route('**/api/issues{,?*}', (route) =>
    route.fulfill({ json: { issues: [issue], nextCursor: null } }),
  );
  await page.route(`**/api/issues/${issue.id}`, (route) =>
    route.fulfill({ json: { issue, occurrences: [], events: [], verifications: [] } }),
  );
  await page.route(`**/api/tests/${saved.id}`, (route) => route.fulfill({ json: { test: saved } }));
  await page.route('**/api/integrations', (route) =>
    route.fulfill({ json: { browserProviders: [], integrations: [], deliveries: [] } }),
  );
});

for (const viewport of [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`all routes fit touch screens at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const path of [
      '/',
      '/login',
      '/register',
      '/onboarding',
      '/cases',
      '/runs',
      '/issues',
      `/issues/${issue.id}`,
      '/integrations',
      '/settings',
      '/missing-page',
    ]) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await fitsPage(page);
      if (path !== '/' && (await page.locator('#main-content').count()))
        await fitsRegion(page.locator('#main-content'));
    }
  });

  test(`execution panels use the full width at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto(`/runs/${run.id}`);
    const dock = page.getByLabel('执行工作台', { exact: true });

    await expect(dock).toHaveAttribute('data-compact', 'true');
    await expect(dock.locator('.dv-groupview')).toHaveCount(1);
    for (const [name, content] of [
      ['步骤', page.locator('section[aria-label="步骤"]')],
      ['回放', page.getByRole('region', { name: '浏览器画面', exact: true })],
      ['录制脚本', page.locator('.cm-editor')],
      ['AI 调用', page.getByRole('region', { name: 'AI 调用记录', exact: true })],
      ['问题', page.getByText('本次执行暂无关联问题', { exact: true })],
      ['控制台', page.getByRole('region', { name: 'Console 记录', exact: true })],
      ['网络', page.getByRole('region', { name: 'Network 记录', exact: true })],
      ['计划', page.locator('[data-ui~="plan-viewport"]')],
    ] as const) {
      await dock.getByRole('tab', { name, exact: true }).click();
      await expect(content).toBeVisible();
      await expect(dock.locator('.dv-groupview')).toHaveCount(1);
      const group = (await dock.locator('.dv-groupview').boundingBox())!;
      const workspace = (await dock.boundingBox())!;

      expect(group.width).toBeCloseTo(workspace.width, 0);
      expect(group.height).toBeGreaterThan(100);
      await fitsPage(page);
    }

    await page.screenshot({ path: testInfo.outputPath('mobile-studio.png') });
  });
}

test('resizing restores desktop groups and preserves recording edits', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/runs/${run.id}`);
  const dock = page.getByLabel('执行工作台', { exact: true });

  await expect(dock.locator('.dv-groupview')).toHaveCount(3);
  await page.getByRole('button', { name: '录制脚本', exact: true }).click();
  const editor = page.locator('.cm-content');

  await editor.fill('await page.goto("https://example.com/mobile");');
  const draft = await editor.innerText();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dock).toHaveAttribute('data-compact', 'true');
  await expect(dock.locator('.dv-groupview')).toHaveCount(1);
  await expect(editor).toHaveText(draft);
  await dock.getByRole('tab', { name: '回放', exact: true }).click();
  await dock.getByRole('tab', { name: '录制脚本', exact: true }).click();
  await expect(editor).toHaveText(draft);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(dock).toHaveAttribute('data-compact', 'false');
  await expect(dock.locator('.dv-groupview')).toHaveCount(3);
  await expect(editor).toHaveText(draft);
  await expect(page.getByRole('button', { name: '展开分组' })).toHaveCount(1);
});

test('phone tabs support keyboard navigation and every layout preset', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/runs/${run.id}`);
  const dock = page.getByLabel('执行工作台', { exact: true });

  await expect(dock).toHaveAttribute('data-compact', 'true');
  await dock.getByRole('tab', { name: '步骤', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(dock.getByRole('tab', { name: '网络', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(dock.getByRole('tab', { name: '步骤', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  for (const name of ['审阅', '调试', '问题', '预设']) {
    await page.getByRole('button', { name: '布局', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await expect(dock).toHaveAttribute('data-compact', 'true');
    await expect(dock.locator('.dv-groupview')).toHaveCount(1);
    await dock.getByRole('tab', { name: '回放', exact: true }).click();
    await fitsPage(page);
  }
});

test('canvas settings and embedded trial work on portrait and landscape phones', async ({
  page,
}, testInfo) => {
  const draftId = 'mobile-draft';

  await page.addInitScript(
    ({ draftId, saved, plan }) => {
      sessionStorage.setItem(
        `testdog:case-draft:${draftId}`,
        JSON.stringify({
          test: saved,
          name: saved.name,
          url: saved.url,
          goal: saved.goal,
          plan,
        }),
      );
    },
    { draftId, saved, plan: run.plan },
  );
  await page.route('**/api/runs', (route) => route.fulfill({ status: 202, json: { run } }));

  for (const viewport of [
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/cases/editor/${draftId}`);
    const canvas = page.getByRole('region', { name: '测试画板' });
    const panel = canvas.getByRole('complementary', { name: '测试面板' });

    await expect(panel).toBeVisible();
    await fitsPage(page);
    await panel.getByRole('button', { name: '展开面板', exact: true }).click();
    await panel.getByLabel('测试名称', { exact: true }).fill('手机测试');
    for (const platform of ['Android · 原生应用', 'iOS · 原生应用', 'Web · 浏览器']) {
      await panel.getByRole('combobox', { name: '平台', exact: true }).click();
      await page.getByRole('option', { name: platform, exact: true }).click();
      await fitsRegion(panel);
    }

    await panel.getByRole('button', { name: '收起面板', exact: true }).click();
    await panel.getByRole('button', { name: 'Run', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /草稿试跑/ });
    const dock = dialog.getByLabel('执行工作台', { exact: true });

    await fitsRegion(dialog);
    await expect(dock).toHaveAttribute('data-compact', 'true');
    await expect(dock.locator('.dv-groupview')).toHaveCount(1);
    await dock.getByRole('tab', { name: '回放', exact: true }).click();
    await expect(dialog.getByRole('region', { name: '浏览器画面', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '关闭试跑', exact: true })).toBeInViewport();
    const preview = (await dialog.locator('[data-ui~="run-replay-surface"]').boundingBox())!;

    expect(preview.height).toBeGreaterThan(60);
    await page.screenshot({ path: testInfo.outputPath(`trial-${viewport.width}.png`) });
    await dialog.getByRole('button', { name: '关闭试跑', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
});

test('case row menus, matrix and delete dialogs remain reachable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/cases');
  const more = page.getByRole('button', { name: `更多操作：${saved.name}`, exact: true });

  await more.click();
  await page.getByRole('menuitem', { name: `矩阵运行 ${saved.name}`, exact: true }).click();
  const matrix = page.getByRole('dialog', { name: /^平台矩阵/ });

  await fitsRegion(matrix);
  await matrix.getByLabel('运行配置（JSON）', { exact: true }).fill('[{}]');
  await matrix.getByRole('button', { name: '取消', exact: true }).click();
  await more.click();
  await page.getByRole('menuitem', { name: `删除 ${saved.name}`, exact: true }).click();
  const remove = page.getByRole('dialog', { name: '删除测试？', exact: true });

  await fitsRegion(remove);
  await expect(remove.getByRole('button', { name: '删除测试', exact: true })).toBeInViewport();
  await remove.getByRole('button', { name: '取消', exact: true }).click();
  await fitsPage(page);
});

test('all integration configuration dialogs fit a touch phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.route('**/api/integrations', (route) =>
    route.fulfill({
      json: {
        emailAvailable: true,
        deliveries: [],
        integrations: ['feishu', 'email'].map((channel) => ({
          channel,
          version: 0,
          enabled: false,
          events: [],
          configured: false,
          hasSigningSecret: false,
        })),
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
  await page.goto('/integrations');
  for (const name of ['配置Browserless', '配置飞书', '配置邮件']) {
    await page.getByRole('button', { name, exact: true }).click();
    const dialog = page.getByRole('dialog');

    await fitsRegion(dialog);
    for (const field of await dialog
      .locator('input:not([type="checkbox"]):visible, textarea:visible')
      .all()) {
      await field.fill('https://example.com');
      await expect(field).toHaveCSS('font-size', '16px');
    }

    await dialog.getByRole('button', { name: '保存配置', exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: '保存配置', exact: true })).toBeInViewport();
    await dialog.getByRole('button', { name: '关闭配置', exact: true }).click();
  }

  await fitsPage(page);
});

test('plan canvas pans with a finger on a phone', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Touch injection uses the Chromium DevTools protocol.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/runs/${run.id}`);
  const dock = page.getByLabel('执行工作台', { exact: true });

  await expect(dock).toHaveAttribute('data-compact', 'true');
  await dock.getByRole('tab', { name: '计划', exact: true }).click();
  const canvas = page.locator('[data-ui~="plan-viewport"]');
  const viewport = canvas.locator('.react-flow__viewport');

  await expect(canvas).toBeVisible();
  const bounds = (await canvas.boundingBox())!;
  const before = await viewport.getAttribute('style');
  const session = await page.context().newCDPSession(page);
  const point = { x: bounds.x + 30, y: bounds.y + 80 };

  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: point.x + 80, y: point.y + 60 }],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(viewport).not.toHaveAttribute('style', before!);
  await session.detach();
});
