import { expect, test } from '@playwright/test';
import { makeRun } from './fixtures/workspace';
import { mockRun, mockWorkspaceSupport } from './fixtures/routes';
import type { BrowserLog } from '@testdog/contracts/runs/types';

const run = makeRun();
const base = { at: run.startedAt, pageId: 'page-1', pageUrl: run.url, elapsedMs: 1200 };
const network: BrowserLog[] = [
  {
    ...base,
    id: 'users',
    kind: 'network',
    url: 'https://api.example.com/users?limit=10&tag=a&tag=b',
    method: 'GET',
    status: 200,
    resourceType: 'fetch',
    durationMs: 120,
    requestHeaders: { accept: 'application/json', authorization: '[redacted]' },
    responseHeaders: { 'content-type': 'application/json' },
  },
  {
    ...base,
    id: 'script',
    elapsedMs: 1500,
    kind: 'network',
    url: 'https://example.com/app.js',
    method: 'GET',
    status: 200,
    resourceType: 'script',
    durationMs: 35,
  },
  {
    ...base,
    id: 'failed',
    elapsedMs: 2000,
    kind: 'network',
    url: 'https://api.example.com/orders',
    method: 'POST',
    status: 503,
    resourceType: 'xhr',
    durationMs: 420,
  },
];
const consoleLogs: BrowserLog[] = [
  { ...base, id: 'info', kind: 'console', level: 'log', message: 'Application ready' },
  { ...base, id: 'warn', kind: 'console', level: 'warning', message: 'Deprecated API' },
  {
    ...base,
    id: 'error',
    kind: 'console',
    level: 'error',
    message: 'Request failed <script>\n at fetchUsers (app.js:42)',
  },
];

test.beforeEach(async ({ page }) => {
  await mockWorkspaceSupport(page);
  await mockRun(page, run);
  await page.route(`**/api/runs/${run.id}/logs?*`, (route) => {
    const params = new URL(route.request().url()).searchParams;
    let logs = params.get('kind') === 'network' ? network : consoleLogs;

    if (params.get('errors') === 'true')
      logs = logs.filter((log) => log.level === 'error' || (log.status || 0) >= 400);
    if (params.get('q'))
      logs = logs.filter((log) =>
        `${log.message || ''} ${log.url || ''}`.includes(params.get('q')!),
      );
    if (params.has('cursor')) logs = [];

    return route.fulfill({ json: { logs, nextCursor: params.has('cursor') ? null : 'next' } });
  });
});

test('network supports sorting, resource filtering and structured request inspection', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`/runs/${run.id}`);
  await page.getByRole('button', { name: 'Network', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Network 记录', exact: true });
  const table = panel.getByRole('table', { name: '网络请求' });

  await expect(table.getByRole('row')).toHaveCount(4);
  await table.getByRole('button', { name: /^Time/ }).click();
  await expect(table.locator('tbody tr').first()).toContainText('app.js');
  await table.getByRole('button', { name: /^Time/ }).click();
  await expect(table.locator('tbody tr').first()).toContainText('orders');
  await panel.getByRole('button', { name: 'Fetch/XHR', exact: true }).click();
  await expect(table.getByRole('row')).toHaveCount(3);
  await panel.getByRole('button', { name: /^查看请求 GET .*users/ }).click();
  const detail = panel.getByRole('complementary', { name: '请求详情' });

  await expect(detail.getByRole('heading', { name: /^Request Headers/ })).toBeVisible();
  await expect(detail.getByText('[redacted]', { exact: true })).toBeVisible();
  await detail.getByRole('tab', { name: 'Query', exact: true }).click();
  await expect(detail.getByText('limit', { exact: true })).toBeVisible();
  await expect(detail.getByText('tag', { exact: true })).toHaveCount(2);
  await detail.getByRole('tab', { name: 'Timing', exact: true }).click();
  await expect(detail.getByText('120 ms', { exact: true })).toBeVisible();
  await detail.getByRole('tab', { name: 'Headers', exact: true }).click();
  await panel.screenshot({ path: testInfo.outputPath('network-wide.png') });
  await page.setViewportSize({ width: 900, height: 850 });
  await expect(detail.getByRole('tab', { name: 'Headers', exact: true })).toBeVisible();
  await panel.screenshot({ path: testInfo.outputPath('network-narrow.png') });
  await detail.getByRole('button', { name: '关闭请求详情' }).click();
  await expect(detail).toHaveCount(0);
  await panel.getByRole('textbox', { name: '搜索浏览器记录' }).fill('orders');
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table).toContainText('503');
  await panel.getByRole('button', { name: '下一页' }).click();
  await expect(panel.getByText('第 2 页')).toBeVisible();
  await expect(panel.getByText('没有匹配的记录')).toBeVisible();
  await panel.getByRole('button', { name: '上一页' }).click();
  await expect(table.getByRole('row')).toHaveCount(2);
});

test('console distinguishes levels, expands sources and searches across records', async ({
  page,
}, testInfo) => {
  await page.goto(`/runs/${run.id}`);
  await page.getByRole('button', { name: 'Console', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Console 记录', exact: true });

  await expect(panel.locator('details')).toHaveCount(3);
  await panel.getByRole('button', { name: /^Warning/ }).click();
  await expect(panel.locator('details')).toHaveCount(1);
  await expect(panel).toContainText('Deprecated API');
  await panel.getByRole('button', { name: /^Error/ }).click();
  await panel.locator('summary').click();
  await expect(panel.getByText('Page URL', { exact: true })).toBeVisible();
  await expect(panel.locator('pre')).toContainText('Request failed <script>');
  await panel.screenshot({ path: testInfo.outputPath('console.png') });
  await panel.getByRole('button', { name: /^全部/ }).click();
  await panel.getByRole('textbox', { name: '搜索浏览器记录' }).fill('Application');
  await expect(panel.locator('details')).toHaveCount(1);
  await expect(panel).toContainText('Application ready');
  await panel.getByRole('button', { name: '清除搜索' }).click();
  await expect(panel.locator('details')).toHaveCount(3);
});
