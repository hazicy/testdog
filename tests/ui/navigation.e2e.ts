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
  await expect(page.getByRole('link', { name: '登录', exact: true }).last()).toHaveAttribute(
    'href',
    '/login?callbackURL=%2Fsettings',
  );

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
      page.getByRole('heading', {
        name: path === '/cases' ? '还没有测试用例' : '暂无执行记录',
        exact: true,
      }),
    ).toBeVisible();
    const empty = await page.locator('[data-ui~="workspace-index-empty"]').boundingBox();
    const footer = await page.locator('[data-ui~="workspace-index-footer"]').boundingBox();

    expect(empty!.height).toBeGreaterThan(600);
    expect(footer!.y).toBeGreaterThan(780);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(900);
  }
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
      const sidebar = (await page.locator('aside').boundingBox())!;

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
