import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { TestCase, TestRun, RunSummary } from '../../src/workspace/types';

const saved: TestCase = {
  id: '62534c46-a8eb-4991-993e-af6df14bece0',
  name: '验证登录',
  url: 'https://example.com',
  goal: '验证登录按钮',
  tags: ['登录'],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};
const run: TestRun = {
  id: '62534c46-a8eb-4991-993e-af6df14bece1',
  testId: saved.id,
  name: saved.name,
  url: saved.url,
  goal: saved.goal,
  mode: 'record',
  status: 'passed',
  startedAt: saved.createdAt,
  finishedAt: saved.createdAt,
  durationMs: 1000,
  replayable: true,
  cancelRequested: false,
  events: [],
  artifacts: [],
  steps: [
    {
      id: '62534c46-a8eb-4991-993e-af6df14bece2',
      runId: '62534c46-a8eb-4991-993e-af6df14bece1',
      sequence: 1,
      kind: 'navigate',
      title: '打开网站',
      status: 'passed',
      startedAt: saved.createdAt,
      pageId: 'page-1',
      pageUrl: saved.url,
      replayable: true,
      action: { type: 'navigate', value: saved.url, target: { kind: 'css', value: '', name: '' } },
    },
  ],
};

const summary: RunSummary = {
  id: run.id,
  testId: run.testId,
  name: run.name,
  url: run.url,
  mode: run.mode,
  status: run.status,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  durationMs: run.durationMs,
  replayable: run.replayable,
  cancelRequested: run.cancelRequested,
};

test('missing execution stops polling and can recover through explicit retry', async ({ page }) => {
  let reads = 0;
  let missing = true;
  await page.clock.install();
  await page.route(`**/api/runs/${run.id}`, (route) => {
    reads++;
    return missing
      ? route.fulfill({ status: 404, json: { message: '执行记录不存在。' } })
      : route.fulfill({ json: { run } });
  });
  await page.goto(`/runs/${run.id}`);
  await expect(page.getByRole('heading', { name: '执行记录不存在', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '返回执行记录', exact: true })).toBeVisible();
  await page.clock.fastForward(100);
  const stoppedAt = reads;
  expect(stoppedAt).toBe(1);
  await page.clock.fastForward(6000);
  expect(reads).toBe(stoppedAt);
  missing = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByRole('heading', { name: saved.name, exact: true })).toBeVisible();
});

test('invalid execution addresses render the custom 404 page', async ({ page }) => {
  const response = await page.goto('/runs/invalid-id');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: '页面不存在', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '返回测试工作台', exact: true })).toHaveAttribute(
    'href',
    '/cases',
  );
});

test('exports complete reports from both history and detail, and allows retry after failure', async ({
  page,
}) => {
  let rejectExport = true;
  await page.route('**/api/tests', (route) => route.fulfill({ json: { tests: [saved] } }));
  await page.route('**/api/runs', (route) => route.fulfill({ json: { runs: [summary] } }));
  await page.route(`**/api/runs/${run.id}`, (route) => {
    if (rejectExport) {
      rejectExport = false;
      return route.fulfill({ status: 503, json: { message: '报告暂时不可用' } });
    }
    return route.fulfill({ json: { run } });
  });
  await page.goto('/runs');
  const exportButton = page.getByRole('button', { name: `导出 ${run.name} 的结果`, exact: true });
  await exportButton.click();
  await expect(page.getByRole('alert').filter({ hasText: '报告暂时不可用' })).toBeVisible();
  const listDownload = page.waitForEvent('download');
  await exportButton.click();
  const report = await listDownload;
  expect(report.suggestedFilename()).toBe(`caseforge-${run.id}.json`);
  expect(JSON.parse(await readFile((await report.path())!, 'utf8'))).toEqual(run);
  await page.goto(`/runs/${run.id}`);
  const detailDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出执行报告', exact: true }).click();
  expect(JSON.parse(await readFile((await (await detailDownload).path())!, 'utf8'))).toEqual(run);
});

test('create, edit, duplicate and delete use independent dialogs and preserve history', async ({
  page,
}) => {
  let tests = [saved];
  let rejectSave = true;
  let rejectDelete = true;
  const writes: { method: string; body: Record<string, unknown> }[] = [];
  await page.route('**/api/tests**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { tests } });
    if (request.method() === 'DELETE') {
      if (rejectDelete) {
        rejectDelete = false;
        return route.fulfill({ status: 503, json: { message: '删除暂时失败' } });
      }
      tests = tests.filter((item) => !request.url().endsWith(item.id));
      return route.fulfill({ json: { success: true } });
    }
    if (rejectSave) {
      rejectSave = false;
      return route.fulfill({ status: 503, json: { message: '保存暂时失败' } });
    }
    const body = request.postDataJSON();
    writes.push({ method: request.method(), body });
    if (request.method() === 'POST')
      tests = [{ ...saved, ...body, id: `${saved.id.slice(0, -1)}${writes.length}` }, ...tests];
    else tests = tests.map((item) => (item.id === saved.id ? { ...item, ...body } : item));
    return route.fulfill({ json: { test: tests[0] } });
  });
  await page.route('**/api/runs', (route) => route.fulfill({ json: { runs: [summary] } }));
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('测试名称').fill('新用例');
  await dialog.getByLabel('网站地址').fill('https://example.com');
  await dialog.getByLabel('测试步骤与预期结果').fill('验证首页');
  await dialog.getByRole('button', { name: '保存测试', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('保存暂时失败');
  await expect(dialog.getByLabel('测试名称')).toHaveValue('新用例');
  await dialog.getByRole('button', { name: '保存测试', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '编辑 验证登录', exact: true }).click();
  await dialog.getByLabel('测试名称').fill('更新登录');
  await dialog.getByRole('button', { name: '保存测试', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '复制 更新登录', exact: true }).click();
  await expect(dialog.getByLabel('测试名称')).toHaveValue('更新登录（副本）');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: '保存测试', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes.map((item) => item.method)).toEqual(['POST', 'PATCH', 'POST']);
  expect(writes[2].body.tags).toEqual(['登录']);
  await page.getByRole('button', { name: '删除 更新登录', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: '删除测试', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('删除暂时失败');
  await dialog.getByRole('button', { name: '删除测试', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '编辑 更新登录', exact: true })).toHaveCount(0);
  await page.goto('/runs');
  await expect(
    page.getByRole('table').getByRole('link', { name: saved.name, exact: true }),
  ).toBeVisible();
});

test('loads recording versions only when opened and keeps the draft across view changes', async ({
  page,
}) => {
  let versionReads = 0;
  await page.route(`**/api/runs/${run.id}`, (route) => route.fulfill({ json: { run } }));
  await page.route(`**/api/runs/${run.id}/recording`, (route) => {
    versionReads++;
    return route.fulfill({ json: { versions: [] } });
  });
  await page.goto(`/runs/${run.id}`);
  await expect(page.getByRole('heading', { name: saved.name, exact: true })).toBeVisible();
  expect(versionReads).toBe(0);
  await page.getByRole('button', { name: '编辑录制', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Playwright 录制脚本' });
  await expect(editor).toBeVisible();
  const draft = 'await page1.goto("https://example.com/changed");';
  await editor.fill(draft);
  await page.getByRole('button', { name: '执行回放', exact: true }).click();
  await expect(editor).toBeHidden();
  await page.getByRole('button', { name: '编辑录制', exact: true }).click();
  await expect(editor).toHaveText(draft);
  expect(versionReads).toBe(1);
});
