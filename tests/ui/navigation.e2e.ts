import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: null }));
  await page.route('**/api/integrations', (route) =>
    route.fulfill({ json: { browserProviders: [], integrations: [], deliveries: [] } }),
  );
  await page.route('**/api/issues*', (route) =>
    route.fulfill({ json: { issues: [], nextCursor: null } }),
  );
  await page.route('**/api/tests*', (route) =>
    route.fulfill({ json: { tests: [], nextCursor: null } }),
  );
  await page.route('**/api/runs*', (route) =>
    route.fulfill({ json: { runs: [], nextCursor: null } }),
  );
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({ json: { testCount: 0, runCount: 0, counts: {} } }),
  );
});

test('sidebar destinations open with one selected item and matching breadcrumbs', async ({
  page,
}) => {
  await page.goto('/cases');
  const sidebar = page.getByRole('navigation', { name: '工作区导航' });
  const breadcrumb = page.getByRole('navigation', { name: '面包屑' });

  for (const [href, name] of [
    ['/runs', '执行记录'],
    ['/issues', '问题追踪'],
    ['/integrations', '集成'],
    ['/settings', '设置'],
    ['/cases', '测试用例'],
  ]) {
    await sidebar.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(href);
    await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(sidebar.getByRole('link', { name, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText(name);
    await expect(page.getByRole('heading', { name: '页面不存在', exact: true })).toHaveCount(0);
  }
});

test('settings supports direct visits, refresh and collapsed navigation', async ({ page }) => {
  await page.goto('/settings');
  await page.reload();
  await expect(page.getByRole('heading', { name: '设置', level: 1, exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '账户资料', exact: true }).click();
  await expect(
    page
      .getByRole('tabpanel', { name: '账户资料' })
      .getByRole('link', { name: '登录', exact: true }),
  ).toHaveAttribute('href', '/login?callbackURL=%2Fsettings');

  await page.getByRole('button', { name: '收起侧栏' }).click();
  const sidebar = page.getByRole('navigation', { name: '工作区导航' });

  await sidebar.getByRole('link', { name: '集成', exact: true }).click();
  await expect(page).toHaveURL('/integrations');
  await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '展开侧栏' })).toBeVisible();
});

test('keeps workspace chrome fixed while long content scrolls inside the viewport', async ({
  page,
}) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/settings');
    const main = page.locator('#main-content');

    await expect(page.getByRole('heading', { name: '设置', level: 1, exact: true })).toBeVisible();
    await main.evaluate((element) => {
      const content = document.createElement('div');

      content.style.height = '2000px';
      element.append(content);
    });
    const header = page.getByRole('navigation', { name: '面包屑' });
    const navigation = page.getByRole('navigation', { name: '工作区导航' });
    const headerBefore = await header.boundingBox();
    const navigationBefore = await navigation.boundingBox();

    await main.evaluate((element) => {
      element.scrollTop = 500;
    });
    expect(await main.evaluate((element) => element.scrollTop)).toBe(500);
    expect(await header.boundingBox()).toEqual(headerBefore);
    expect(await navigation.boundingBox()).toEqual(navigationBefore);
    expect(
      await page.evaluate(() => ({
        scrollTop: document.scrollingElement?.scrollTop,
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth,
      })),
    ).toEqual({ scrollTop: 0, height: viewport.height, width: viewport.width });
  }
});

test('empty lists fill the remaining workspace height', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ['/cases', '/runs']) {
    await page.goto(path);
    await expect(
      page.getByText(path === '/cases' ? '还没有测试用例' : '暂无执行记录', { exact: true }),
    ).toBeVisible();
    const empty = await page.locator('[data-ui~="workspace-index-empty"]').boundingBox();

    expect(empty!.height).toBeGreaterThan(600);
    await expect(page.locator('[data-ui~="workspace-index-footer"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(900);
  }
});

test('workspace pages keep controls within narrow screens', async ({ page }) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 740 });
    for (const path of ['/cases', '/runs', '/issues', '/integrations', '/settings']) {
      await page.goto(path);
      await expect(page.locator('#main-content')).toBeVisible();
      const sizes = await page.locator('#main-content').evaluate((main) => ({
        pageWidth: document.documentElement.scrollWidth,
        contentWidth: main.clientWidth,
        scrollWidth: main.scrollWidth,
      }));

      expect(sizes.pageWidth).toBe(width);
      expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.contentWidth + 1);
      for (const button of await page.locator('#main-content button:visible').all()) {
        const bounds = await button.boundingBox();

        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      }
    }
  }
});

test('public pages fit phone screens', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 740 });
    for (const path of ['/', '/login', '/register']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
  }
});

test('landing stays at the top when compact playback mounts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const dock = page.locator('[data-ui="dock"]');

  await expect(dock).toHaveAttribute('data-compact', 'true');
  await expect(dock.getByRole('tab', { selected: true })).toHaveText('回放');
  // Wait through layout and effects after the mobile tab strip is committed.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('quick creation keeps prompt text and actions accessible on a phone', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await page.goto('/cases');
  await page.getByRole('button', { name: '快速创建', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '快速创建' });
  const input = dialog.getByRole('textbox', { name: '测试步骤与预期结果' });

  await input.fill('打开登录页面，输入邮箱和密码，确认登录成功。');
  await expect(input).toHaveCSS('padding-left', '16px');
  await expect(dialog.getByRole('button', { name: '生成', exact: true })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: '关闭描述输入' })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('quick-create-phone.png') });
  await dialog.getByRole('button', { name: '关闭描述输入' }).click();
  await expect(dialog).toHaveCount(0);
});

test('keeps sign out within the sidebar on short, narrow and collapsed layouts', async ({
  page,
}) => {
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'user-1', name: '测试用户', email: 'user@example.com', emailVerified: true },
        session: { id: 'session-1', userId: 'user-1', expiresAt: '2099-01-01T00:00:00Z' },
      },
    }),
  );
  for (const viewport of [
    { width: 1280, height: 360 },
    { width: 390, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/cases');
    const signOut = page.getByRole('button', { name: '退出', exact: true });

    await expect(signOut).toBeInViewport();
    await page.locator('#main-content').evaluate((element) => {
      const content = document.createElement('div');

      content.style.height = '2000px';
      element.append(content);
      element.scrollTop = 1000;
    });
    await expect(signOut).toBeInViewport();
    const checkBounds = async () => {
      const button = (await signOut.boundingBox())!;
      const sidebar = (await page
        .getByRole('navigation', { name: '工作区导航' })
        .locator('..')
        .boundingBox())!;

      expect(button.x).toBeGreaterThanOrEqual(sidebar.x);
      expect(button.x + button.width).toBeLessThanOrEqual(sidebar.x + sidebar.width);
      expect(button.y + button.height).toBeLessThanOrEqual(viewport.height);
    };

    await checkBounds();
    if (viewport.width >= 768) {
      await page.getByRole('button', { name: '收起侧栏' }).click();
      await expect(signOut).toBeInViewport();
      await checkBounds();
    }
  }
});
