import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';

const { Workbook } = createRequire(new URL('../../apps/web/package.json', import.meta.url))(
  'exceljs',
);

import { readFile } from 'node:fs/promises';

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64',
);

test('groups screenshot nodes and downloads an Excel workbook with embedded evidence', async ({
  page,
}) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: null }));
  await page.route('**/api/runs?*', (route) =>
    route.fulfill({
      json: {
        runs: [{ id: 'r1', name: 'UI run', startedAt: '2026-10-17T00:00:00Z' }],
        nextCursor: null,
      },
    }),
  );
  await page.route('**/api/runs/r1', (route) =>
    route.fulfill({
      json: {
        run: {
          id: 'r1',
          name: 'UI run',
          plan: {
            rootId: 'shot',
            nodes: {
              shot: {
                id: 'shot',
                kind: 'task',
                actionType: 'screenshot',
                goal: '登录页面',
                dependsOn: [],
                requirementIds: [],
                assertions: [],
              },
            },
          },
          steps: [{ id: 's1', planNodeId: 'shot', title: '截图', status: 'passed' }],
          artifacts: [{ id: 'a1', stepId: 's1', kind: 'screenshot', contentType: 'image/png' }],
        },
      },
    }),
  );
  await page.route('**/api/runs/r1/artifacts/a1', (route) =>
    route.fulfill({ body: image, contentType: 'image/png' }),
  );
  await page.goto('/plugins');
  await page.getByRole('button', { name: /Excel 验收导出/ }).click();
  await expect(page.getByRole('link', { name: '插件', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('combobox', { name: '执行', exact: true }).click();
  await page.getByRole('option', { name: /UI run/ }).click();
  await page.getByRole('checkbox', { name: '登录页面' }).click();
  await page.getByRole('textbox', { name: '分组名称' }).fill('登录验收');
  await page.getByRole('button', { name: '创建分组' }).click();
  const downloadEvent = page.waitForEvent('download');

  await page.getByRole('button', { name: '导出 Excel' }).click();
  const download = await downloadEvent;

  expect(download.suggestedFilename()).toBe('ui-acceptance.xlsx');
  const workbook = new Workbook();
  const bytes = await readFile((await download.path())!);

  await workbook.xlsx.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  expect(workbook.worksheets[0].name).toBe('登录验收');
  expect(workbook.worksheets[0].getImages()).toHaveLength(1);
  expect(workbook.worksheets[0].getCell('A2').value).toBe('登录页面');
});

test('configures the plugin centrally and keeps canvas nodes to key and group', async ({
  page,
}, testInfo) => {
  let settings = {
    id: 'volcengine-abtest',
    version: 0,
    config: {
      urlIncludes: '/service/2/abtest_config/',
      dataPath: '/data',
      experiments: [] as {
        key: string;
        groups: { name: string; value: unknown; variantId?: string }[];
      }[],
    },
  };

  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: null }));
  await page.route(/\/api\/plugins$/, (route) => route.fulfill({ json: { settings: [settings] } }));
  await page.route('**/api/plugins/volcengine-abtest', (route) => {
    const input = route.request().postDataJSON();

    settings = { ...settings, config: input.config, version: settings.version + 1 };

    return route.fulfill({ json: { settings: [settings] } });
  });
  await page.route('**/api/tests*', (route) =>
    route.fulfill({ json: { tests: [], nextCursor: null } }),
  );
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({ json: { testCount: 0, runCount: 0, counts: {} } }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/plugins');
  await expect(page.getByRole('button', { name: /火山引擎 A\/B 测试/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('plugins-directory.png') });
  await page.getByRole('button', { name: /火山引擎 A\/B 测试/ }).click();
  await expect(page).toHaveURL(/plugin=volcengine-abtest/);
  const saveSettings = page.getByRole('button', { name: '保存配置', exact: true });

  await expect(saveSettings).toBeDisabled();
  await page.getByRole('textbox', { name: '接口地址包含', exact: true }).fill('/abtest_config');
  await page.getByRole('button', { name: '添加实验', exact: true }).click();
  await page.getByRole('textbox', { name: '实验 key', exact: true }).fill('checkout_layout');
  await page.getByRole('textbox', { name: '组名', exact: true }).fill('B 组');
  await page.getByRole('textbox', { name: '实验值（JSON）', exact: true }).fill('invalid json');
  await saveSettings.click();
  await expect(page.locator('main').getByRole('alert')).toContainText('返回值需为有效 JSON');
  await page.getByRole('textbox', { name: '实验值（JSON）', exact: true }).fill('{"group":"B"}');
  await page.getByRole('textbox', { name: '版本 vid', exact: true }).fill('variant-b');
  await saveSettings.click();
  await expect(
    page
      .getByRole('region', { name: '通知', exact: true })
      .getByText('已保存', { exact: true })
      .last(),
  ).toBeVisible();
  await expect(saveSettings).toBeDisabled();
  expect(settings.config.experiments[0]).toMatchObject({
    key: 'checkout_layout',
    groups: [{ name: 'B 组', value: { group: 'B' }, variantId: 'variant-b' }],
  });
  await page.reload();
  await expect(page.getByRole('textbox', { name: '接口地址包含', exact: true })).toHaveValue(
    '/abtest_config',
  );
  await expect(page.getByRole('textbox', { name: '组名', exact: true })).toHaveValue('B 组');
  await page.screenshot({ path: testInfo.outputPath('plugin-settings-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('plugin-settings-mobile.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).first().click();
  const canvas = page.locator('[data-ui~="case-canvas-page"]');

  await canvas.getByRole('button', { name: '在 root 的第 1 个位置添加节点', exact: true }).click();
  await page
    .getByRole('menuitem')
    .filter({ hasText: /^Plugin/ })
    .click();
  const dialog = page.getByRole('dialog', { name: '火山引擎 A/B 测试', exact: true });

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox')).toHaveCount(2);
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await dialog.getByRole('combobox', { name: '实验 key', exact: true }).click();
  await page.getByRole('option', { name: 'checkout_layout', exact: true }).click();
  await dialog.getByRole('combobox', { name: '组', exact: true }).click();
  await page.getByRole('option', { name: 'B 组', exact: true }).click();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  const pluginNode = canvas.locator('[data-step-type=plugin]');

  await expect(pluginNode).toContainText('checkout_layout · B 组');
  await page.reload();
  await pluginNode.locator('[data-ui="plan-content-button"]').click();
  await expect(dialog.getByRole('combobox', { name: '实验 key', exact: true })).toContainText(
    'checkout_layout',
  );
  await expect(dialog.getByRole('combobox', { name: '组', exact: true })).toContainText('B 组');
  await page.screenshot({ path: testInfo.outputPath('plugin-node-settings.png') });
});
