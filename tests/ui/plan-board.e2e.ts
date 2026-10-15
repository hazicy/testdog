import { expect, test } from '@playwright/test';

test('canvas insertion visibility, editing history and Chinese composition work together', async ({
  page,
}, testInfo) => {
  await page.route('**/api/tests*', (route) =>
    route.fulfill({ json: { tests: [], nextCursor: null } }),
  );
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({ json: { testCount: 0, runCount: 0, counts: {} } }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).first().click();
  const canvas = page.locator('[data-ui~="case-canvas-page"]');
  const viewport = canvas.locator('[data-ui~="plan-viewport"]');
  const firstInsert = canvas.getByRole('button', {
    name: '在 root 的第 1 个位置添加节点',
    exact: true,
  });

  await expect(firstInsert).toHaveCSS('opacity', '1');
  for (const index of [1, 2]) {
    await canvas
      .getByRole('button', { name: `在 root 的第 ${index} 个位置添加节点`, exact: true })
      .click();
    await page.getByRole('menuitem').filter({ hasText: /^Act/ }).click();
  }

  const tasks = canvas.locator('[data-step-type=act]');
  const middleInsert = canvas.getByRole('button', {
    name: '在 root 的第 2 个位置添加节点',
    exact: true,
  });
  const tailInsert = canvas.getByRole('button', {
    name: '在 root 的第 3 个位置添加节点',
    exact: true,
  });

  await expect(tasks).toHaveCount(2);
  await viewport.focus();
  await page.mouse.move(0, 0);
  await expect(middleInsert).toHaveCSS('opacity', '0');
  await expect(tailInsert).toHaveCSS('opacity', '1');
  await tasks.first().hover();
  await expect(middleInsert).toHaveCSS('opacity', '1');
  await tasks.first().locator('[data-ui~="step-badge"]').click();
  await viewport.focus();
  await page.mouse.move(0, 0);
  await expect(middleInsert).toHaveCSS('opacity', '0');
  await middleInsert.hover();
  await middleInsert.click();
  await expect(
    page.getByRole('menu', { name: '在 root 的第 2 个位置添加节点', exact: true }),
  ).toBeVisible();
  await expect(middleInsert).toHaveCSS('opacity', '1');
  await page
    .getByRole('menu', { name: '在 root 的第 2 个位置添加节点', exact: true })
    .press('Escape');
  await expect(
    page.getByRole('menu', { name: '在 root 的第 2 个位置添加节点', exact: true }),
  ).toBeHidden();
  await page.mouse.move(0, 0);
  await middleInsert.focus();
  await expect(middleInsert).toHaveCSS('opacity', '1');

  await canvas.getByRole('button', { name: '撤销画板操作', exact: true }).click();
  await expect(tasks).toHaveCount(1);
  await canvas.getByRole('button', { name: '重做画板操作', exact: true }).click();
  await expect(tasks).toHaveCount(2);
  const before = await tasks.first().locator('[data-ui~="plan-content-button"]').textContent();
  const transform = await viewport.locator('.react-flow__viewport').getAttribute('style');

  await tasks.first().locator('[data-ui~="plan-content-button"]').click();
  const input = canvas.getByRole('textbox', { name: /^节点内容/ });

  await input.fill('中文输入确认');
  await input.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
    ),
  );
  await expect(input).toBeVisible();
  await input.press('Escape');
  await expect(tasks.first()).toContainText(before!);
  await tasks.first().locator('[data-ui~="plan-content-button"]').click();
  await input.fill('检查登录结果');
  await input.press('Enter');
  await expect(tasks.first()).toContainText('检查登录结果');
  expect(await viewport.locator('.react-flow__viewport').getAttribute('style')).toBe(transform);
  await viewport.focus();
  await page.keyboard.press('Control+z');
  await expect(tasks.first()).toContainText(before!);
  await page.keyboard.press('Control+Shift+z');
  await expect(tasks.first()).toContainText('检查登录结果');
  await tasks.first().locator('[data-ui~="plan-content-button"]').click();
  await input.fill('检查页面中的订单信息与用户信息是否正确'.repeat(8) + '\n第二行\n第三行');
  await input.press('Enter');
  const firstBounds = (await tasks.first().boundingBox())!;
  const textBounds = (await tasks
    .first()
    .locator('[data-ui~="plan-content-button"]')
    .boundingBox())!;
  const nextBounds = (await tasks.last().boundingBox())!;

  expect(textBounds.y + textBounds.height).toBeLessThanOrEqual(firstBounds.y + firstBounds.height);
  expect(nextBounds.y).toBeGreaterThan(firstBounds.y + firstBounds.height);
  await canvas.getByRole('button', { name: '撤销画板操作', exact: true }).click();
  await expect(tasks.first()).toContainText('检查登录结果');

  const id = (await tasks.first().getAttribute('data-plan-node'))!;

  await tasks.first().hover();
  await canvas.getByRole('button', { name: `删除节点 ${id}`, exact: true }).click();
  await expect(tasks).toHaveCount(1);
  await canvas.getByRole('button', { name: '撤销画板操作', exact: true }).click();
  await expect(tasks).toHaveCount(2);
  await expect(tasks.first()).toContainText('检查登录结果');
  await canvas.getByRole('button', { name: '画板恢复原始比例', exact: true }).click();
  await expect(canvas.getByRole('button', { name: '画板恢复原始比例', exact: true })).toHaveText(
    '100%',
  );
  await canvas.getByRole('button', { name: '全览画板', exact: true }).click();
  await page.mouse.move(0, 0);
  await expect(middleInsert).toHaveCSS('opacity', '0');
  await viewport.screenshot({ path: testInfo.outputPath('canvas-hover-insertions.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas.getByRole('button', { name: '全览画板', exact: true })).toBeVisible();
  const controls = await canvas.locator('[data-ui~="plan-viewport-controls"]').boundingBox();

  expect(controls!.x).toBeGreaterThanOrEqual(0);
  expect(controls!.x + controls!.width).toBeLessThanOrEqual(390);
});

test('canvas settings make room on phones and preserve edits when dismissed', async ({
  page,
}, testInfo) => {
  await page.route('**/api/tests*', (route) =>
    route.fulfill({ json: { tests: [], nextCursor: null } }),
  );
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({ json: { testCount: 0, runCount: 0, counts: {} } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).first().click();
  const canvas = page.getByRole('region', { name: '测试画板' });
  const name = canvas.getByRole('textbox', { name: '测试名称', exact: true });
  const viewport = canvas.locator('[data-ui="plan-viewport"]');

  await name.fill('验证登录');
  const closedBounds = (await viewport.boundingBox())!;

  await canvas.getByRole('button', { name: '展开面板', exact: true }).click();
  const settings = canvas.getByRole('complementary', { name: '测试设置', exact: true });
  const openBounds = (await viewport.boundingBox())!;
  const settingsBounds = (await settings.boundingBox())!;

  expect(openBounds.y + openBounds.height).toBeLessThanOrEqual(settingsBounds.y);
  expect(settingsBounds.x).toBeGreaterThanOrEqual(0);
  expect(settingsBounds.x + settingsBounds.width).toBeLessThanOrEqual(390);
  await settings.getByRole('combobox', { name: '浏览器与设备' }).click();
  await page.getByRole('option', { name: 'Pixel 7 · Chromium', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('canvas-settings-phone.png') });
  await settings.getByRole('button', { name: '关闭设置' }).click();
  await expect(settings).toBeHidden();
  await expect(canvas.getByRole('button', { name: '展开面板' })).toBeFocused();
  await expect(canvas.getByRole('button', { name: '展开面板' })).toContainText('Web · Pixel 7');
  await expect(name).toHaveValue('验证登录');
  expect(await viewport.boundingBox()).toEqual(closedBounds);
  await canvas.getByRole('button', { name: '展开面板' }).click();
  await settings.getByRole('combobox', { name: '浏览器与设备' }).focus();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
});
