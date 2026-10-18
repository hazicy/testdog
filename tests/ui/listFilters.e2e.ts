import { test, expect } from './fixtures/test.fixture';
import { mockWorkspaceSupport } from './fixtures/routes';

for (const list of [
  { path: '/cases', api: 'tests', search: '搜索测试' },
  { path: '/runs', api: 'runs', search: '搜索结果' },
  { path: '/issues', api: 'issues', search: '搜索问题' },
]) {
  test(`${list.path} restores URL filters on reload and browser navigation`, async ({
    page,
    listPage,
  }) => {
    await mockWorkspaceSupport(page);
    const requests: URLSearchParams[] = [];

    await page.route(new RegExp(`/api/${list.api}(?:\\?.*)?$`), (route) => {
      requests.push(new URL(route.request().url()).searchParams);

      return route.fulfill({ json: { tests: [], runs: [], issues: [], nextCursor: null } });
    });
    const issues = list.api === 'issues';

    await page.goto(
      `${list.path}?q=checkout&status=${issues ? 'open' : 'failed'}${issues ? '&platform=web&days=7&sort=updated' : ''}`,
    );
    const search = listPage.searchInput(list.search);
    const status = listPage.statusFilter(issues);

    await expect(search).toHaveValue('checkout');
    await expect.poll(() => requests.at(-1)?.get('q')).toBe('checkout');
    if (issues) {
      expect(requests.at(-1)?.get('platform')).toBe('web');
      expect(requests.at(-1)?.get('days')).toBe('7');
      expect(requests.at(-1)?.get('sort')).toBe('updated');
    }

    await status.click();
    await page.getByRole('option', { name: issues ? '处理中' : '已通过', exact: true }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('status'))
      .toBe(issues ? 'in_progress' : 'passed');
    await page.goBack();
    await expect(status).toContainText(issues ? '待确认' : '失败');
    await expect
      .poll(() => new URL(page.url()).searchParams.get('status'))
      .toBe(issues ? 'open' : 'failed');
    await search.fill('payment');
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('payment');
    await page.reload();
    await expect(search).toHaveValue('payment');
    await expect.poll(() => requests.at(-1)?.get('q')).toBe('payment');
    await search.clear();
    await expect.poll(() => new URL(page.url()).searchParams.has('q')).toBe(false);
    await page.goto(
      `${list.path}?status=invalid${issues ? '&platform=invalid&days=invalid&sort=invalid' : ''}`,
    );
    await expect(status).toContainText('全部状态');
    await expect.poll(() => requests.at(-1)?.get('status') ?? 'all').toBe('all');
    if (issues) {
      await page.goto(`${list.path}?platform=web`);
      await expect(page.getByText('没有匹配的问题', { exact: true })).toBeVisible();
    }
  });
}
