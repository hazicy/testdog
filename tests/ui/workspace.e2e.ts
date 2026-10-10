import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { TestCase } from '../../src/features/test-cases/types';
import type { TestRun, RunSummary } from '../../src/features/runs/types';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/builds', (route) => route.fulfill({ json: { builds: [] } }));
  await page.route('**/api/resources', (route) => route.fulfill({ json: { resources: [] } }));
});

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

test('frame playback and step selection keep the matching evidence visible', async ({ page }) => {
  const secondStep = { ...run.steps[0], id: 'second-step', sequence: 2, title: '检查页面' };
  const artifacts = [run.steps[0], secondStep].flatMap((step, index) =>
    (['before', 'after'] as const).map((stage, offset) => ({
      id: `frame-${index}-${stage}`,
      runId: run.id,
      stepId: step.id,
      kind: 'screenshot' as const,
      stage,
      pageId: 'page-1',
      pageUrl: `${saved.url}/${index}/${stage}`,
      capturedAt: saved.createdAt,
      elapsedMs: (index * 2 + offset) * 1000,
      contentType: 'image/svg+xml',
      size: 100,
    })),
  );

  await page.route(`**/api/runs/${run.id}`, (route) =>
    route.fulfill({ json: { run: { ...run, steps: [...run.steps, secondStep], artifacts } } }),
  );
  await page.route(`**/api/runs/${run.id}/artifacts/*`, (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"/>',
    }),
  );
  await page.goto(`/runs/${run.id}`);
  const image = page.getByRole('img', { name: /^执行画面/ });

  await expect(image).toHaveAttribute('src', /frame-1-after$/);
  await page
    .getByRole('region', { name: '执行步骤' })
    .getByRole('button', { name: /打开网站/ })
    .click();
  await expect(image).toHaveAttribute('src', /frame-0-after$/);
  await expect(page.getByRole('heading', { name: '打开网站', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查看执行前', exact: true }).click();
  await expect(image).toHaveAttribute('src', /frame-0-before$/);
  await page.getByRole('button', { name: '播放回看', exact: true }).click();
  await expect(image).toHaveAttribute('src', /frame-1-after$/);
  await expect(page.getByRole('heading', { name: '检查页面', exact: true })).toBeVisible();
});

test('stops frame playback in video mode and pauses video when leaving execution', async ({
  page,
}) => {
  const frames = [0, 1, 2].map((index) => ({
    id: `paused-frame-${index}`,
    runId: run.id,
    kind: 'screenshot',
    stage: 'live',
    pageId: 'page-1',
    pageUrl: saved.url,
    capturedAt: saved.createdAt,
    elapsedMs: index * 1000,
    contentType: 'image/jpeg',
    size: 1,
  }));

  await page.route(`**/api/runs/${run.id}`, (route) =>
    route.fulfill({
      json: {
        run: {
          ...run,
          artifacts: [
            ...frames,
            { ...frames[0], id: 'video', kind: 'video', contentType: 'video/webm' },
          ],
        },
      },
    }),
  );
  await page.route(`**/api/runs/${run.id}/artifacts/*`, (route) => route.fulfill({ body: '' }));
  await page.clock.install();
  await page.goto(`/runs/${run.id}`);
  await expect(page.getByRole('button', { name: '播放回看', exact: true })).toBeEnabled();
  await page.clock.pauseAt(new Date(Date.now() + 3600000));
  await page.getByRole('button', { name: '播放回看', exact: true }).click();
  await expect(page.getByRole('slider', { name: '画面时间轴' })).toHaveValue('0');
  await page.getByRole('button', { name: '完整录像', exact: true }).click();
  const video = page.getByLabel('执行录像');

  await video.evaluate((element) => {
    (element as HTMLVideoElement).pause = () => {
      element.dataset.pausedByView = 'true';
    };
  });
  await page.clock.fastForward(5000);
  await page.getByRole('button', { name: '计划画板', exact: true }).click();
  await expect(video).toHaveAttribute('data-paused-by-view', 'true');
  await page.clock.fastForward(5000);
  await page.getByRole('button', { name: '执行回放', exact: true }).click();
  await page.getByRole('button', { name: '画面回看', exact: true }).click();
  await expect(page.getByRole('slider', { name: '画面时间轴' })).toHaveValue('0');
  await expect(page.getByRole('button', { name: '播放回看', exact: true })).toBeVisible();
});

test('fallback polling keeps unchanged details and receives the completed execution', async ({
  page,
}) => {
  let completed = false;
  const conditions: (string | undefined)[] = [];

  await page.route(`**/api/runs/${run.id}`, (route) => {
    const condition = route.request().headers()['if-none-match'];

    conditions.push(condition);
    if (condition === '"running"' && !completed)
      return route.fulfill({ status: 304, headers: { ETag: '"running"' } });

    return route.fulfill({
      json: { run: { ...run, status: completed ? 'passed' : 'running' } },
      headers: { ETag: completed ? '"done"' : '"running"' },
    });
  });
  await page.route(`**/api/runs/${run.id}/events?*`, (route) => route.fulfill({ status: 503 }));
  await page.clock.install();
  await page.goto(`/runs/${run.id}`);
  await expect(page.getByText('执行中', { exact: true })).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 3600000));
  await page.clock.fastForward(5000);
  await expect.poll(() => conditions.includes('"running"')).toBe(true);
  await expect(page.getByRole('heading', { name: saved.name, exact: true })).toBeVisible();
  completed = true;
  await page.clock.fastForward(5000);
  await expect(page.getByRole('button', { name: '重放操作', exact: true })).toBeVisible();
});

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

test('case search combines tags and latest status while history uses each execution status', async ({
  page,
}) => {
  const untouched = {
    ...saved,
    id: '62534c46-a8eb-4991-993e-af6df14bece8',
    name: '未运行用例',
    tags: ['SMOKE'],
  };
  const older = {
    ...summary,
    id: '62534c46-a8eb-4991-993e-af6df14bece9',
    status: 'failed' as const,
  };

  await page.route('**/api/tests', (route) =>
    route.fulfill({ json: { tests: [saved, untouched] } }),
  );
  await page.route('**/api/runs', (route) => route.fulfill({ json: { runs: [summary, older] } }));
  await page.goto('/cases');
  const search = page.getByRole('textbox', { name: '搜索测试', exact: true });
  const filter = page.getByLabel('状态筛选');

  await search.fill('smoke');
  await expect(page.getByRole('button', { name: '未运行用例', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: saved.name, exact: true })).toHaveCount(0);
  await filter.click();
  await page.getByRole('option', { name: '未运行', exact: true }).click();
  await expect(page.getByRole('button', { name: '未运行用例', exact: true })).toBeVisible();
  await search.fill('');
  await filter.click();
  await page.getByRole('option', { name: '失败', exact: true }).click();
  await expect(page.getByText('没有符合条件的记录', { exact: true })).toBeVisible();
  await filter.click();
  await page.getByRole('option', { name: '已通过', exact: true }).click();
  await expect(page.getByRole('button', { name: saved.name, exact: true })).toBeVisible();
  await page.getByRole('link', { name: '执行记录', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '搜索结果', exact: true })).toBeVisible();
  await page.getByLabel('状态筛选').click();
  await page.getByRole('option', { name: '失败', exact: true }).click();
  const result = page.getByRole('table').getByRole('link', { name: saved.name, exact: true });

  await expect(result).toHaveCount(1);
  await expect(result).toHaveAttribute('href', `/runs/${older.id}`);
});

test('history loads and refreshes without depending on the case library', async ({ page }) => {
  let caseReads = 0;
  let runReads = 0;

  await page.route('**/api/tests', (route) => {
    caseReads++;

    return route.fulfill({ status: 503, json: { message: '用例库暂时不可用' } });
  });
  await page.route('**/api/runs', (route) => {
    runReads++;

    return route.fulfill({ json: { runs: [summary] } });
  });
  await page.goto('/runs');
  await expect(
    page.getByRole('table').getByRole('link', { name: saved.name, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect.poll(() => runReads).toBeGreaterThan(1);
  expect(caseReads).toBe(0);
  await page.getByRole('link', { name: '前往测试', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '用例库暂时不可用' })).toBeVisible();
  expect(caseReads).toBe(1);
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

test('dialogs support keyboard entry, Escape dismissal and focus restoration', async ({ page }) => {
  await page.route('**/api/tests', (route) => route.fulfill({ json: { tests: [saved] } }));
  await page.route('**/api/runs', (route) => route.fulfill({ json: { runs: [summary] } }));
  await page.goto('/cases');
  const create = page.getByRole('button', { name: '新建测试', exact: true });

  await create.focus();
  await create.press('Enter');
  await expect(page.getByRole('dialog').getByLabel('测试名称')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(create).toBeFocused();
  const remove = page.getByRole('button', { name: `删除 ${saved.name}`, exact: true });

  await remove.focus();
  await remove.press('Enter');
  const dialog = page.getByRole('dialog');

  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(remove).toBeFocused();
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
  await expect(page.getByRole('main')).toBeFocused();
  await page.goto('/runs');
  await expect(
    page.getByRole('table').getByRole('link', { name: saved.name, exact: true }),
  ).toBeVisible();
});

test('nested plans keep node evidence and dependency navigation through zoom and pan', async ({
  page,
}) => {
  const plan: TestRun['plan'] = {
    rootId: 'root',
    nodes: {
      root: {
        id: 'root',
        kind: 'group',
        goal: '登录流程',
        children: ['open', 'check'],
        dependsOn: [],
      },
      open: {
        id: 'open',
        kind: 'task',
        goal: '打开网站',
        dependsOn: [],
        requirementIds: [],
        assertions: [],
      },
      check: {
        id: 'check',
        kind: 'task',
        goal: '检查标题',
        dependsOn: ['open'],
        requirementIds: ['R1'],
        assertions: [{ description: '登录入口可见' }],
      },
    },
  };

  await page.route(`**/api/runs/${run.id}`, (route) =>
    route.fulfill({
      json: {
        run: { ...run, plan, steps: [{ ...run.steps[0], planNodeId: 'open' }] },
      },
    }),
  );
  await page.goto(`/runs/${run.id}`);
  await page.getByRole('button', { name: '计划画板', exact: true }).click();
  const dependency = page.locator('.react-flow__edge[aria-label="依赖：open → check"]');

  await expect(dependency).toBeVisible();
  await page.getByRole('button', { name: '依赖连线', exact: true }).click();
  await expect(dependency).toHaveCount(0);
  await page.getByRole('button', { name: '依赖连线', exact: true }).click();
  await expect(dependency).toBeVisible();
  await page.getByRole('button', { name: '查看节点 check', exact: true }).click();
  const detail = page.getByRole('complementary', { name: '计划节点详情' });

  await expect(detail).toContainText('预期：登录入口可见');
  await page.getByRole('button', { name: '放大画板', exact: true }).click();
  const viewport = page.getByLabel('计划画板', { exact: true });

  await viewport.focus();
  await viewport.press('ArrowRight');
  await expect(detail).toContainText('预期：登录入口可见');
  await detail.getByRole('button', { name: 'open ↗', exact: true }).click();
  await expect(detail.getByRole('button', { name: /打开网站/ })).toBeVisible();
  await detail.getByRole('button', { name: /打开网站/ }).click();
  await expect(page.getByRole('heading', { name: '打开网站', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '执行回放', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('validates the current draft and locks editing while saving a version', async ({ page }) => {
  let release!: () => void;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  let submitted = '';

  await page.route(`**/api/runs/${run.id}`, (route) => route.fulfill({ json: { run } }));
  await page.route(`**/api/runs/${run.id}/recording`, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { versions: [] } });
    submitted = route.request().postDataJSON().code;
    await response;
    await route.fulfill({
      json: {
        version: {
          id: 'saved-version',
          runId: run.id,
          code: submitted,
          createdAt: saved.createdAt,
        },
      },
    });
  });
  await page.clock.install();
  await page.goto(`/runs/${run.id}`);
  await page.getByRole('button', { name: '编辑录制', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Playwright 录制脚本' });
  const save = page.getByRole('button', { name: '保存版本', exact: true });

  await expect(save).toBeEnabled();
  await page.clock.pauseAt(new Date(Date.now() + 3600000));
  await editor.fill('invalid script');
  await expect(save).toBeDisabled();
  await page.clock.fastForward(300);
  const editorRegion = page.getByRole('region', { name: '录制编辑器' });

  await expect(editorRegion.getByRole('alert')).toBeVisible();
  const draft = 'await page1.goto("https://example.com/changed");';

  await editor.fill(draft);
  await expect(save).toBeDisabled();
  await expect(editorRegion.getByRole('alert')).toHaveCount(0);
  await page.clock.fastForward(300);
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByLabel('录制版本')).toBeDisabled();
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await expect(save).toBeDisabled();
  release();
  await expect(editorRegion.getByRole('status')).toHaveText('新版本已保存。');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await expect(editor).toHaveText(draft);
  expect(submitted).toBe(draft);
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

test('plan subflows retain both branch paths, shared references and external dependencies', async ({
  page,
}) => {
  const task = (id: string) => ({
    id,
    kind: 'task',
    goal: id,
    dependsOn: [],
    requirementIds: [],
    assertions: [],
  });
  const plan = {
    rootId: 'root',
    nodes: {
      root: {
        id: 'root',
        kind: 'group',
        goal: '嵌套流程',
        children: ['nested', 'branch'],
        dependsOn: ['external'],
      },
      nested: {
        id: 'nested',
        kind: 'group',
        goal: '准备步骤',
        children: ['shared'],
        dependsOn: [],
      },
      branch: {
        id: 'branch',
        kind: 'branch',
        condition: '是否登录？',
        then: 'shared',
        otherwise: 'login',
        dependsOn: ['shared'],
      },
      shared: { ...task('shared'), assertions: [{ description: '共享步骤完成' }] },
      login: task('login'),
      external: task('external'),
    },
  };
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(`**/api/runs/${run.id}`, (route) =>
    route.fulfill({
      json: {
        run: { ...run, plan, steps: [{ ...run.steps[0], planNodeId: 'shared', status: 'failed' }] },
      },
    }),
  );
  await page.goto(`/runs/${run.id}`);
  await page.getByRole('button', { name: '计划画板', exact: true }).click();
  await expect(page.getByText('YES / 条件成立', { exact: true })).toBeVisible();
  await expect(page.getByText('NO / 条件不成立', { exact: true })).toBeVisible();
  await expect(page.locator('.react-flow__edge[aria-label="依赖：external → root"]')).toBeVisible();
  await expect(page.locator('[data-plan-node="shared"] .ws-status.failed')).toHaveCount(2);
  await page.getByRole('button', { name: '查看引用节点 shared', exact: true }).click();
  const detail = page.getByRole('complementary', { name: '计划节点详情' });

  await expect(detail).toContainText('预期：共享步骤完成');
  await expect(detail.getByRole('button', { name: /打开网站/ })).toBeVisible();
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(page.locator('.react-flow__viewport')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 24, 24)',
  );
  await page.getByRole('button', { name: '适应画板', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看节点 login', exact: true })).toBeInViewport();
  await expect(detail).toContainText('预期：共享步骤完成');
  expect(errors).toEqual([]);
});

test('applies SSE step updates and stops polling while connected', async ({ page }) => {
  const activeRun = {
    ...run,
    status: 'running' as const,
    finishedAt: undefined,
    durationMs: undefined,
    steps: [],
    realtimeRevision: 1,
  };
  let reads = 0;

  await page.route(`**/api/runs/${run.id}`, (route) => {
    reads++;

    return route.fulfill({ json: { run: activeRun } });
  });
  await page.addInitScript((snapshot) => {
    const streams: EventTarget[] = [];

    Object.assign(window, { __caseforgeStreams: streams });
    class FakeEventSource extends EventTarget {
      onerror = null;
      constructor() {
        super();
        streams.push(this);
        setTimeout(() => {
          this.dispatchEvent(
            new MessageEvent('snapshot', { data: JSON.stringify({ run: snapshot }) }),
          );
          this.dispatchEvent(new MessageEvent('ready', { data: '{}' }));
        }, 0);
      }
      close() {}
    }
    Object.assign(window, { EventSource: FakeEventSource });
  }, activeRun);
  await page.goto(`/runs/${run.id}`);
  await expect(page.getByText('执行中', { exact: true })).toBeVisible();
  await page.waitForFunction(
    () =>
      (window as unknown as { __caseforgeStreams: EventTarget[] }).__caseforgeStreams.length > 0,
  );
  await page.evaluate((step) => {
    const streams = (window as unknown as { __caseforgeStreams: EventTarget[] }).__caseforgeStreams;

    streams.at(-1)!.dispatchEvent(
      new MessageEvent('updates', {
        data: JSON.stringify([
          { kind: 'step', revision: 2, data: { ...step, title: '推送新增步骤' } },
        ]),
      }),
    );
  }, run.steps[0]);
  await expect(
    page.getByRole('region', { name: '执行步骤' }).getByRole('button', { name: /推送新增步骤/ }),
  ).toBeVisible();
  // Cross the fallback interval to verify a healthy stream disabled periodic reads.
  await page.waitForTimeout(5500);
  expect(reads).toBe(1);
});
