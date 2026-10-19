import { test, expect } from './fixtures/test.fixture';

test('canvas insertion visibility, editing history and Chinese composition work together', async ({
  page,
  caseEditor,
}, testInfo) => {
  await page.route('**/api/tests*', (route) =>
    route.fulfill({ json: { tests: [], nextCursor: null } }),
  );
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({ json: { testCount: 0, runCount: 0, counts: {} } }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await caseEditor.goto();
  await caseEditor.newTestButton.first().click();
  const canvas = caseEditor.canvas;
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
  const zoomIn = canvas.getByRole('button', { name: '放大画板', exact: true });
  const zoomOut = canvas.getByRole('button', { name: '缩小画板', exact: true });

  for (let index = 0; index < 3; index++) await zoomIn.click();
  await expect(zoomIn).toBeDisabled();
  await expect(canvas.getByRole('button', { name: '画板恢复原始比例', exact: true })).toHaveText(
    '150%',
  );
  for (let index = 0; index < 20 && (await zoomOut.isEnabled()); index++) await zoomOut.click();
  await expect(zoomOut).toBeDisabled();
  await expect(canvas.getByRole('button', { name: '画板恢复原始比例', exact: true })).toHaveText(
    '8%',
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
  caseEditor,
}, testInfo) => {
  await page.route('**/api/tests*', (route) =>
    route.fulfill({ json: { tests: [], nextCursor: null } }),
  );
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({ json: { testCount: 0, runCount: 0, counts: {} } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await caseEditor.goto();
  await caseEditor.newTestButton.first().click();
  const canvas = caseEditor.board;
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

test('insertion uses the clicked slot, cancels without changes and focuses the new content', async ({
  page,
  caseEditor,
}) => {
  await page.route('**/api/tests*', (route) =>
    route.fulfill({ json: { tests: [], nextCursor: null } }),
  );
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({ json: { testCount: 0, runCount: 0, counts: {} } }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await caseEditor.goto();
  await caseEditor.newTestButton.first().click();
  const canvas = caseEditor.canvas;
  const slot = (index: number) =>
    canvas.getByRole('button', { name: `在 root 的第 ${index} 个位置添加节点`, exact: true });
  const input = canvas.getByRole('textbox', { name: /^节点内容/ });

  await slot(1).focus();
  await slot(1).press('Enter');
  const menu = page.getByRole('menu');

  await expect(menu).toContainText('分组开头');
  await expect(menu.getByRole('combobox')).toHaveCount(0);
  await menu.press('Escape');
  await expect(menu).toBeHidden();
  await expect(slot(1)).toBeFocused();
  await expect(canvas.locator('[data-step-type=act]')).toHaveCount(0);
  await expect(canvas.getByRole('button', { name: '撤销画板操作' })).toBeDisabled();

  await slot(1).press('Enter');
  await menu.getByRole('menuitem').filter({ hasText: /^Act/ }).focus();
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await expect(input).toBeFocused();
  expect(
    await input.evaluate((element: HTMLTextAreaElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([0, '填写操作步骤'.length]);
  await input.fill('第一步');
  // Opening the next insertion commits the current draft before deriving its context.
  await slot(2).click();
  await expect(menu).toContainText('在「第一步」后');
  await menu
    .getByRole('menuitem')
    .filter({ hasText: /^Assert/ })
    .click();
  await expect(input).toBeFocused();
  await input.fill('最后一步');
  await input.press('Enter');
  await slot(2).hover();
  await slot(2).click();
  await menu.getByRole('menuitem').filter({ hasText: /^Act/ }).click();
  await expect(input).toBeFocused();
  await input.fill('中间一步');
  await input.press('Enter');
  const nodes = canvas.locator('[data-step-type=act], [data-step-type=assert]');

  const contents = nodes.locator('[data-ui~="plan-content-button"]');

  await expect(contents).toHaveText(['第一步', '中间一步', '最后一步']);
  await canvas.getByRole('button', { name: '撤销画板操作' }).click();
  await expect(contents).toHaveText(['第一步', '填写操作步骤', '最后一步']);
  await canvas.getByRole('button', { name: '撤销画板操作' }).click();
  await expect(contents).toHaveText(['第一步', '最后一步']);
  await canvas.getByRole('button', { name: '重做画板操作' }).click();
  await expect(input).toHaveCount(0);
  await expect(nodes).toHaveCount(3);
});

test('branch insertion keeps each path separate and the continuation outside both paths on phones', async ({
  page,
  caseEditor,
}, testInfo) => {
  await page.route('**/api/tests*', (route) =>
    route.fulfill({ json: { tests: [], nextCursor: null } }),
  );
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({ json: { testCount: 0, runCount: 0, counts: {} } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await caseEditor.goto();
  await caseEditor.newTestButton.first().click();
  const canvas = caseEditor.canvas;
  const input = canvas.getByRole('textbox', { name: /^节点内容/ });
  const insert = async (group: string, position: number, type: string, text: string) => {
    const trigger = canvas.getByRole('button', {
      name: `在 ${group} 的第 ${position} 个位置添加节点`,
      exact: true,
    });

    await trigger.click();
    const menu = page.getByRole('menu');
    const bounds = (await menu.boundingBox())!;

    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
    await menu
      .getByRole('menuitem')
      .filter({ hasText: new RegExp(`^${type}`) })
      .click();
    await expect(input).toBeFocused();
    await input.fill(text);
    await input.press('Enter');
  };

  await insert('root', 1, 'Branch', '是否已登录？');
  const branchId = (await canvas
    .locator('[data-step-type=branch]')
    .getAttribute('data-plan-node'))!;

  await insert(`${branchId}:then`, 1, 'Navigate', 'https://example.com/home');
  await canvas.getByRole('button', { name: '全览画板', exact: true }).click();
  await insert(`${branchId}:otherwise`, 1, 'Act', '执行登录');
  await canvas.getByRole('button', { name: '全览画板', exact: true }).click();
  await insert('root', 2, 'Screenshot', '保存最终页面');
  await canvas.getByRole('button', { name: '全览画板', exact: true }).click();
  await canvas.screenshot({ path: testInfo.outputPath('branch-insertion-phone.png') });
  await page.reload();
  await expect(canvas.locator('[data-step-type=navigate]')).toContainText(
    'https://example.com/home',
  );
  await expect(canvas.locator('[data-step-type=act]')).toContainText('执行登录');
  await expect(canvas.locator('[data-step-type=screenshot]')).toContainText('保存最终页面');
  await expect(
    canvas.getByRole('button', { name: `在 ${branchId}:then 的第 2 个位置添加节点`, exact: true }),
  ).toHaveCount(1);
  await expect(
    canvas.getByRole('button', {
      name: `在 ${branchId}:otherwise 的第 2 个位置添加节点`,
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(
    canvas.getByRole('button', { name: '在 root 的第 3 个位置添加节点', exact: true }),
  ).toHaveCount(1);
});

test('Feishu paste imports editable steps and expectations with undo and persistence', async ({
  page,
  caseEditor,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  });
  await page.route('**/api/tests*', (route) =>
    route.fulfill({ json: { tests: [], nextCursor: null } }),
  );
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({ json: { testCount: 0, runCount: 0, counts: {} } }),
  );
  await caseEditor.goto();
  await caseEditor.create();
  const canvas = caseEditor.canvas;
  const viewport = canvas.locator('[data-ui="plan-viewport"]');
  const data = [
    ['topic', '登录场景', ''],
    ['step', '步骤：输入账号并登录', 'topic'],
    ['expected', '预期：显示用户首页', 'step'],
  ].map(([id, text, parentId]) => ({
    id,
    type: 24,
    info: {
      baseV2: { x: 0, y: 0, width: 150, height: 50 },
      textV2: { text },
      mindMap: { parentId },
    },
  }));
  const html = `<span data-info="--%whiteboard-x--${Buffer.from(encodeURIComponent(JSON.stringify({ data }))).toString('base64')}--whiteboard-x%--"></span>`;
  const paste = async (target = viewport, content = html) => {
    await target.evaluate((element, value) => {
      const clipboardData = new DataTransfer();

      clipboardData.setData('text/html', value);
      clipboardData.setData('text/plain', '步骤：输入账号并登录');
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
      );
    }, content);
  };

  const actions = canvas.locator('[data-step-type=act]');
  const assertions = canvas.locator('[data-step-type=assert]');

  await viewport.focus();
  await paste();
  await expect(actions).toHaveCount(1);
  await expect(actions).toContainText('输入账号并登录');
  await expect(assertions).toContainText('显示用户首页');
  await paste();
  await expect(actions).toHaveCount(2);
  await viewport.focus();
  await page.keyboard.press('Control+z');
  await expect(actions).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(actions).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await actions.first().locator('[data-ui~="plan-content-button"]').click();
  const input = canvas.getByRole('textbox', { name: /^节点内容/ });

  await paste(input);
  await expect(actions).toHaveCount(1);
  await input.fill('修改后的登录步骤');
  await input.press('Enter');
  await paste(viewport, '<span data-info="--%whiteboard-x--bad!--whiteboard-x%--"></span>');
  await expect(
    page.getByText('无法导入，请重新复制飞书思维导图中的步骤和预期结果。'),
  ).toBeVisible();
  await expect(actions).toHaveCount(1);
  await page.reload();
  await expect(actions).toContainText('修改后的登录步骤');
  await expect(assertions).toContainText('显示用户首页');
});
