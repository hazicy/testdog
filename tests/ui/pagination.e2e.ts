import { expect, test } from '@playwright/test';
import type { Issue } from '@testdog/contracts/issues/types';
import { mockWorkspaceSupport } from './fixtures/routes';
import { makeCase, makeRun, summarizeRun } from './fixtures/workspace';

const saved = makeCase({ name: '第一页记录' });
const second = makeCase({ id: '62534c46-a8eb-4991-993e-af6df14bece8', name: '第二页记录' });
const issue: Issue = {
  id: saved.id,
  title: saved.name,
  description: '',
  status: 'open',
  category: 'product',
  severity: 'high',
  closeReason: null,
  version: 1,
  createdAt: saved.createdAt,
  updatedAt: saved.updatedAt,
};

for (const list of [
  { path: '/cases', api: 'tests', search: '搜索测试', empty: '还没有测试用例' },
  { path: '/runs', api: 'runs', search: '搜索结果', empty: '暂无执行记录' },
  { path: '/issues', api: 'issues', search: '搜索问题', empty: '暂无问题' },
]) {
  test(`${list.path} hides loading counts and paginates without accumulating rows`, async ({
    page,
  }) => {
    await mockWorkspaceSupport(page);
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    let releaseSecond!: () => void;
    const secondReady = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const requests: URLSearchParams[] = [];
    let empty = false;

    await page.route(new RegExp(`/api/${list.api}(?:\\?.*)?$`), async (route) => {
      const params = new URL(route.request().url()).searchParams;

      requests.push(params);
      await ready;
      if (params.has('cursor')) await secondReady;
      const item = params.has('cursor') ? second : saved;

      await route.fulfill({
        json: {
          tests: empty ? [] : [item],
          runs: empty ? [] : [summarizeRun(makeRun({ id: item.id }, item))],
          issues: empty ? [] : [{ ...issue, id: item.id, title: item.name }],
          nextCursor: !empty && !params.has('cursor') ? 'second-page' : null,
        },
      });
    });
    await page.goto(list.path);
    await expect(page.getByRole('status', { name: /正在加载/ })).toBeVisible();
    const footer = page.locator('[data-ui="workspace-index-footer"]');

    await expect(footer).toHaveCount(0);
    release();
    await expect(page.getByRole('table').getByText(saved.name, { exact: true })).toBeVisible();
    await expect(footer).toContainText('本页 1 条记录');
    await expect(footer).toContainText('第 1 页');
    await expect(page.getByRole('button', { name: '上一页', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(footer).toContainText('第 2 页');
    await expect(footer).not.toContainText('条记录');
    await expect(page.getByRole('button', { name: '上一页', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
    releaseSecond();
    await expect(page.getByRole('table').getByText(second.name, { exact: true })).toBeVisible();
    await expect(page.getByRole('table').getByText(saved.name, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
    expect(requests.at(-1)?.get('cursor')).toBe('second-page');
    await page.getByRole('button', { name: '上一页', exact: true }).click();
    await expect(footer).toContainText('第 1 页');
    await expect(page.getByRole('table').getByText(saved.name, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(page.getByRole('table').getByText(second.name, { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: list.search, exact: true }).fill('搜索');
    await expect.poll(() => requests.at(-1)?.get('q')).toBe('搜索');
    expect(requests.at(-1)?.has('cursor')).toBe(false);
    await expect(footer).toContainText('第 1 页');

    await page.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(page.getByRole('table').getByText(second.name, { exact: true })).toBeVisible();
    await page.getByLabel(list.api === 'issues' ? '筛选问题状态' : '状态筛选').click();
    const filterLabel = list.api === 'issues' ? '处理中' : '失败';

    await page.getByRole('option', { name: filterLabel, exact: true }).click();
    await expect
      .poll(() => requests.at(-1)?.get('status'))
      .toBe(list.api === 'issues' ? 'in_progress' : 'failed');
    expect(requests.at(-1)?.has('cursor')).toBe(false);
    await expect(footer).toContainText('第 1 页');

    empty = true;
    await page.reload();
    await expect(page.getByText(list.empty, { exact: true })).toBeVisible();
    await expect(footer).toHaveCount(0);
  });
}
