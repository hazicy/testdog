import { expect, test, type Locator } from '@playwright/test';

async function openSettings(editor: Locator) {
  await expect(editor.getByRole('complementary', { name: '测试面板' })).toBeVisible();
  const expand = editor.getByRole('button', { name: '展开面板', exact: true });

  if (await expand.count()) await expand.click();
  await expect(editor.getByLabel('测试名称', { exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({
      json: {
        testCount: 1,
        runCount: 1,
        counts: {
          queued: 0,
          preparing: 0,
          running: 0,
          finalizing: 0,
          passed: 1,
          failed: 0,
          cancelled: 0,
        },
      },
    }),
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
  await page.route(/\/api\/tests(?:\?.*)?$/, (route) => route.fulfill({ json: { tests: [] } }));
  await page.route(/\/api\/runs(?:\?.*)?$/, (route) => route.fulfill({ json: { runs: [] } }));
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

test('field overrides and focus styles survive the shared CSS Module controls', async ({
  page,
}) => {
  await page.goto('/cases');
  await expect(page.getByRole('textbox', { name: '搜索测试', exact: true })).toHaveCSS(
    'padding-left',
    '36px',
  );
  await page.getByRole('button', { name: '新建测试', exact: true }).first().click();
  const editor = page.locator('[data-ui~="case-canvas-page"]');

  await openSettings(editor);
  const name = editor.getByRole('textbox', { name: '测试名称', exact: true });

  await expect(name).toHaveCSS('margin-top', '0px');
  await name.focus();
  await expect(name).toHaveCSS('border-top-color', 'rgb(216, 184, 168)');
  await expect(name).not.toHaveCSS('box-shadow', 'none');
  await expect(editor.getByRole('combobox', { name: '平台', exact: true })).toHaveCSS(
    'display',
    'inline-flex',
  );
  await expect(editor.getByLabel('输入引用（JSON，可选）', { exact: true })).toHaveCount(0);
});

test('select keyboard navigation and Escape stay within the editor dialog', async ({ page }) => {
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).first().click();
  const dialog = page.locator('[data-ui~="case-canvas-page"]');

  await openSettings(dialog);
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
  await expect(dialog).toBeVisible();
  await page.getByRole('link', { name: '测试用例', exact: true }).first().click();
  await expect(dialog).toHaveCount(0);
});

test('native setup validates required selection and submits custom checkbox values', async ({
  page,
}) => {
  let submitted: Record<string, unknown> | undefined;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route(/\/api\/tests(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { tests: [] } });
    submitted = route.request().postDataJSON();
    await pending;
    await route.fulfill({ json: { test: submitted } });
  });
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).first().click();
  const dialog = page.locator('[data-ui~="case-canvas-page"]');

  await openSettings(dialog);

  await dialog.getByLabel('测试名称', { exact: true }).fill('Native setup');
  await dialog.getByLabel('平台', { exact: true }).click();
  await page.getByRole('option', { name: 'iOS · 原生应用', exact: true }).click();
  await dialog.getByLabel('应用标识', { exact: true }).fill('com.example.fixture');
  await dialog.getByRole('button', { name: '收起面板' }).click();
  await dialog.getByRole('button', { name: '在 root 的第 1 个位置添加节点', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: /^Act/ }).click();
  await dialog.locator('[data-step-type=act] [data-ui~="plan-content-button"]').click();
  await dialog.getByRole('textbox', { name: /^节点内容/ }).fill('Verify welcome');
  await dialog.getByRole('textbox', { name: /^节点内容/ }).press('Enter');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('设备配置');
  expect(submitted).toBeUndefined();
  await dialog.getByLabel('设备配置', { exact: true }).click();
  await page.getByRole('option', { name: 'iphone-fixture · 可用', exact: true }).click();
  const video = dialog.getByRole('checkbox', { name: '视频', exact: true });

  await video.focus();
  await video.press('Space');
  await expect(video).toBeChecked();

  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveAttribute('aria-busy', 'true');
  await expect(video).toBeDisabled();
  await expect(dialog.getByLabel('平台', { exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(submitted).toMatchObject({
    target: {
      platform: 'ios',
      deviceProfileId: 'iphone-fixture',
      evidence: { video: true },
    },
  });
  release();
  await expect(dialog).toHaveCount(0);
});

test('native text conversion includes application context before selecting a device', async ({
  page,
}) => {
  let submitted: Record<string, unknown> | undefined;

  await page.route('**/api/tests/compile', (route) => {
    submitted = route.request().postDataJSON();

    return route.fulfill({
      json: {
        plan: {
          rootId: 'check',
          nodes: {
            check: {
              id: 'check',
              kind: 'task',
              actionType: 'assert',
              goal: '显示 Ada',
              dependsOn: [],
              requirementIds: [],
              assertions: [{ description: '显示 Ada' }],
            },
          },
        },
      },
    });
  });
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).first().click();
  const editor = page.locator('[data-ui~="case-canvas-page"]');

  await openSettings(editor);
  await editor.getByLabel('平台', { exact: true }).click();
  await page.getByRole('option', { name: 'iOS · 原生应用', exact: true }).click();
  await editor.getByLabel('应用标识', { exact: true }).fill('com.example.app');
  await editor.getByRole('button', { name: '描述生成', exact: true }).click();
  await page.getByLabel('测试步骤与预期结果').fill('验证显示 Ada');
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await page.getByRole('button', { name: '全部接受', exact: true }).click();
  expect(submitted).toEqual({
    goal: '验证显示 Ada',
    context: {
      platform: 'ios',
      appId: 'com.example.app',
    },
  });
  await expect(editor.locator('[data-step-type=assert]')).toContainText('显示 Ada');
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
  await expect(page.getByRole('tabpanel', { name: '表单提交', exact: true })).toContainText(
    'app.example.com/contact',
  );
  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab', { name: '页面导航', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: '页面导航', exact: true })).toContainText(
    'app.example.com/settings',
  );
});

test('compact panel defaults closed and Run retries the draft without saving the case', async ({
  page,
}) => {
  const testId = '62534c46-a8eb-4991-993e-af6df14bece0';
  const runId = '62534c46-a8eb-4991-993e-af6df14bece1';
  const writes: string[] = [];
  let attempts = 0;

  await page.route('**/api/tests/compile', (route) =>
    route.fulfill({
      json: {
        plan: {
          rootId: 'task',
          nodes: {
            task: {
              id: 'task',
              kind: 'task',
              goal: '验证首页',
              dependsOn: [],
              requirementIds: [],
              assertions: [],
            },
          },
        },
      },
    }),
  );
  await page.route(/\/api\/tests(?:\?.*)?$/, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { tests: [] } });
    writes.push('POST');

    return route.fulfill({ json: { test: { ...route.request().postDataJSON(), id: testId } } });
  });
  await page.route(`**/api/tests/${testId}`, (route) => {
    writes.push('PATCH');

    return route.fulfill({ json: { test: { ...route.request().postDataJSON(), id: testId } } });
  });
  await page.route(/\/api\/runs(?:\?.*)?$/, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { runs: [] } });
    expect(route.request().postDataJSON()).toMatchObject({
      draft: { name: '验证首页', target: { platform: 'web', deviceProfile: 'legacy-desktop' } },
    });
    expect(route.request().headers()['idempotency-key']).toBeTruthy();
    attempts++;

    return route.fulfill(
      attempts === 1
        ? { status: 503, json: { message: '运行暂时失败' } }
        : { json: { run: { id: runId } } },
    );
  });
  await page.route(`**/api/runs/${runId}`, (route) =>
    route.fulfill({ status: 404, json: { message: '执行详情尚未就绪' } }),
  );
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).first().click();
  const panel = page.getByRole('complementary', { name: '测试面板' });

  await expect(panel).toHaveAttribute('data-collapsed', 'true');
  await expect(panel.getByRole('button', { name: '展开面板' })).toBeVisible();
  await expect(panel.getByRole('button', { name: '返回用例列表' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '试跑', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: '保存', exact: true })).toBeVisible();
  const canvas = page.locator('[data-ui~="plan-viewport"]');
  const viewport = page.locator('.react-flow__viewport');

  await expect(canvas.locator('.react-flow__node').first()).toBeVisible();
  const initialTransform = await viewport.getAttribute('style');

  await page.getByRole('button', { name: '放大画板' }).click();
  await expect(viewport).not.toHaveAttribute('style', initialTransform!);
  const transform = await viewport.getAttribute('style');
  const bounds = await canvas.boundingBox();

  await panel.getByRole('button', { name: '展开面板' }).click();
  await expect(panel.getByLabel('测试名称', { exact: true })).toBeVisible();
  const settings = page.getByRole('complementary', { name: '测试设置', exact: true });

  await expect(settings).toBeVisible();
  await expect(page.getByRole('button', { name: '画板恢复原始比例' })).toHaveText('120%');
  const reducedBounds = (await canvas.boundingBox())!;
  const settingsBounds = (await settings.boundingBox())!;

  expect(reducedBounds.width).toBeLessThan(bounds!.width);
  expect(reducedBounds.x + reducedBounds.width).toBeLessThanOrEqual(settingsBounds.x);
  await page.screenshot({ path: test.info().outputPath('canvas-settings-desktop.png') });
  await panel.getByRole('button', { name: '收起面板' }).click();
  await expect(panel).toHaveAttribute('data-collapsed', 'true');
  await expect(viewport).toHaveAttribute('style', transform!);
  expect(await canvas.boundingBox()).toEqual(bounds);
  await panel.getByRole('button', { name: '描述生成', exact: true }).click();
  await expect(page.getByLabel('测试步骤与预期结果')).toHaveAttribute(
    'placeholder',
    '描述测试步骤和预期结果，可附上网站地址…',
  );
  await expect(viewport).toHaveAttribute('style', transform!);
  expect(await canvas.boundingBox()).toEqual(bounds);
  const overlay = page.getByRole('dialog', { name: '描述测试' });

  await expect(overlay).toBeVisible();
  expect(await overlay.boundingBox()).toEqual(
    await page.locator('[data-ui~="case-canvas-page"]').boundingBox(),
  );
  expect(await page.getByLabel('测试步骤与预期结果').boundingBox()).toEqual(
    await overlay.boundingBox(),
  );
  await expect(page.getByLabel('测试步骤与预期结果')).toBeFocused();
  await page
    .locator('[data-ui~="case-canvas-page"]')
    .screenshot({ path: 'artifacts/ui/case-prompt-overlay.png' });
  await page.getByLabel('测试步骤与预期结果').fill('打开 https://example.com，验证首页');
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await page.getByRole('button', { name: '全部接受' }).click();
  await panel.getByRole('button', { name: '试跑', exact: true }).click();
  await expect(page.getByRole('region', { name: '测试画板' }).getByRole('alert')).toHaveText(
    '运行暂时失败',
  );
  await panel.getByRole('button', { name: '试跑', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /草稿试跑/ })).toBeVisible();
  expect(attempts).toBe(2);
  expect(writes).toEqual([]);
});

test('reviews generated edits, additions and deletions individually before saving the mixed board', async ({
  page,
}) => {
  let generation = 0;
  let stored:
    { plan: { nodes: Record<string, { goal?: string; children?: string[] }> } } | undefined;
  const task = (id: string, goal: string) => ({
    id,
    kind: 'task',
    actionType: 'act',
    goal,
    dependsOn: [],
    requirementIds: [],
    assertions: [],
  });

  await page.route('**/api/tests/compile', (route) => {
    generation++;
    const request = route.request().postDataJSON();

    expect(request.context).toEqual({ platform: 'web' });
    if (generation === 2) expect(request.currentPlan.nodes).toHaveProperty('a');
    const tasks =
      generation === 1
        ? [task('a', '打开首页'), task('b', '点击登录')]
        : [task('a', '打开账号页'), task('c', '上传文件'), task('d', '截取页面')];

    return route.fulfill({
      json: {
        plan: {
          rootId: 'root',
          nodes: Object.fromEntries(
            [
              {
                id: 'root',
                kind: 'group',
                goal: '登录测试',
                children: tasks.map((node) => node.id),
                dependsOn: [],
              },
              ...tasks,
            ].map((node) => [node.id, node]),
          ),
        },
      },
    });
  });
  await page.route(/\/api\/tests(?:\?.*)?$/, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { tests: [] } });
    stored = route.request().postDataJSON();

    return route.fulfill({ json: { test: stored } });
  });
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).first().click();
  await page.getByRole('button', { name: '描述生成', exact: true }).click();
  await page.getByLabel('测试步骤与预期结果').fill('打开 https://example.com，验证登录');
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await page.getByRole('button', { name: '全部接受', exact: true }).click();
  await page.getByRole('button', { name: '描述调整', exact: true }).click();
  await page.getByLabel('测试步骤与预期结果').fill('调整操作');
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(page.locator('[data-plan-node=a]')).toHaveAttribute('data-review', 'modified');
  await expect(page.locator('[data-plan-node=b]')).toHaveAttribute('data-review', 'removed');
  await expect(page.locator('[data-plan-node=c]')).toHaveAttribute('data-review', 'added');
  await page
    .locator('[data-ui~="case-canvas-page"]')
    .screenshot({ path: 'artifacts/ui/case-plan-review.png' });
  await page.getByRole('button', { name: '接受变更 a', exact: true }).click();
  await page.getByRole('button', { name: '拒绝变更 c', exact: true }).click();
  await page.getByRole('button', { name: '拒绝变更 b', exact: true }).click();
  await expect(page.locator('[data-plan-node=b]')).toContainText('点击登录');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '接受变更 d', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('[data-ui~="case-canvas-page"]')).toHaveCount(0);
  expect(stored?.plan.nodes.root.children).toEqual(['a', 'b', 'd']);
  expect(stored?.plan.nodes.a.goal).toBe('打开账号页');
  expect(stored?.plan.nodes.c).toBeUndefined();
});
