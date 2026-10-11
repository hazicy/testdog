import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: null }));
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
    ['/test-account', '测试账号'],
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

test('feature destinations support direct visits, refresh and collapsed navigation', async ({
  page,
}) => {
  for (const [href, name, destination] of [
    ['/issues', '问题追踪', '/runs'],
    ['/integrations', '集成', '/runs'],
    ['/test-account', '测试账号', '/cases'],
    ['/settings', '设置', '/cases'],
  ]) {
    const response = await page.goto(href);

    expect(response?.status()).toBe(200);
    await page.reload();
    await expect(page.getByRole('heading', { name, level: 1, exact: true })).toBeVisible();
    const status = page.getByRole('region', { name: `${name}功能状态` });

    await expect(status.getByText('尚未开放', { exact: true })).toBeVisible();
    await expect(status.getByRole('link')).toHaveAttribute('href', destination);
  }

  await page.getByRole('button', { name: '收起侧栏' }).click();
  const sidebar = page.getByRole('navigation', { name: '工作区导航' });

  await sidebar.getByRole('link', { name: '集成', exact: true }).click();
  await expect(page).toHaveURL('/integrations');
  await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '展开侧栏' })).toBeVisible();
});
