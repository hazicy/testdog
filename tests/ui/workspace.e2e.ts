import { expect, test, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeCase, makeRun, makeStep, makeScreenshot, summarizeRun } from './fixtures/workspace';
import { mockWorkspaceSupport, mockRun, mockLists, mockScreenshots } from './fixtures/routes';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import type { BrowserLog, TestRun } from '@testdog/contracts/runs/types';

async function openSettings(editor: Locator) {
  await expect(editor.getByRole('complementary', { name: '测试面板' })).toBeVisible();
  const expand = editor.getByRole('button', { name: '展开面板', exact: true });

  if (await expand.count()) await expand.click();
  await expect(editor.getByLabel('测试名称', { exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await mockWorkspaceSupport(page);
});

const saved = makeCase();
const run = makeRun({}, saved);
const summary = summarizeRun(run);

test('frame playback and step selection keep the matching evidence visible', async ({ page }) => {
  const secondStep = makeStep(run, { id: 'second-step', sequence: 2, title: '检查页面' });
  const artifacts = [run.steps[0], secondStep].flatMap((step, index) =>
    (['before', 'after'] as const).map((stage, offset) =>
      makeScreenshot(run, {
        id: `frame-${index}-${stage}`,
        stepId: step.id,
        stage,
        pageUrl: `${saved.url}/${index}/${stage}`,
        elapsedMs: (index * 2 + offset) * 1000,
      }),
    ),
  );

  await mockRun(page, makeRun({ steps: [...run.steps, secondStep], artifacts }));
  await mockScreenshots(page, run.id);
  await page.goto(`/runs/${run.id}`);
  const image = page.getByRole('img', { name: /^执行画面/ });

  await expect(image).toHaveAttribute('src', /frame-1-after$/);
  const mark = page.getByRole('button', { name: '跳转动作：检查页面', exact: true });

  await expect(mark).toHaveAttribute('title', '00:02 · 检查页面');
  await mark.click();
  await expect(image).toHaveAttribute('src', /frame-1-before$/);
  await expect(page.getByRole('button', { name: '播放回看', exact: true })).toBeVisible();

  await page
    .getByRole('region', { name: '步骤' })
    .getByRole('button', { name: /打开网站/ })
    .click();
  await expect(image).toHaveAttribute('src', /frame-0-after$/);
  await expect(
    page
      .locator('section[aria-label="步骤"]')
      .getByRole('heading', { name: '打开网站', exact: true }),
  ).toBeVisible();
  await page.getByRole('slider', { name: '画面时间轴' }).fill('0');
  await expect(image).toHaveAttribute('src', /frame-0-before$/);
  await expect(page.getByLabel('回放时间', { exact: true })).toHaveText('00:00 / 00:03');
  await page.getByRole('slider', { name: '画面时间轴' }).fill('2500');
  await expect(image).toHaveAttribute('src', /frame-1-before$/);
  await expect(page.getByLabel('回放时间', { exact: true })).toHaveText('00:02 / 00:03');
  await page.getByRole('slider', { name: '画面时间轴' }).fill('0');

  await page.getByRole('button', { name: '播放回看', exact: true }).click();
  await expect(image).toHaveAttribute('src', /frame-1-after$/);
  await expect(page.getByRole('heading', { name: '打开网站', exact: true })).toBeVisible();
});

test('resumes live replay at the right edge and keeps historical seeks paused', async ({
  page,
}) => {
  const frames = [0, 5000].map((elapsedMs) =>
    makeScreenshot(run, { id: `live-frame-${elapsedMs}`, elapsedMs }),
  );
  const activeRun = makeRun({
    status: 'running',
    finishedAt: undefined,
    durationMs: 5000,
    artifacts: frames,
    realtimeRevision: 1,
  });

  await mockRun(page, activeRun);
  await mockScreenshots(page, run.id);
  await page.addInitScript(() => {
    class FakeEventSource extends EventTarget {
      constructor() {
        super();
        Object.assign(window, { replayStream: this });
        setTimeout(() => this.dispatchEvent(new MessageEvent('ready', { data: '{}' })), 0);
      }
      close() {}
    }
    Object.assign(window, { EventSource: FakeEventSource });
  });
  await page.goto(`/runs/${run.id}`);
  const slider = page.getByRole('slider', { name: '画面时间轴' });
  const live = page.getByText(/● LIVE/);

  await expect(page.getByRole('button', { name: '跟随实时画面' })).toHaveCount(0);
  await expect(live).toBeVisible();
  await expect(slider).toHaveAttribute('aria-valuenow', '5000');
  await slider.fill('1000');
  await expect(live).toHaveCount(0);
  await expect(page.getByLabel('回放时间', { exact: true })).toHaveText('00:01 / 00:05');
  await slider.fill('5000');
  await expect(live).toBeVisible();

  const updatedRun = {
    ...activeRun,
    durationMs: 7000,
    realtimeRevision: 2,
    artifacts: [...frames, makeScreenshot(run, { id: 'live-frame-7000', elapsedMs: 7000 })],
  };

  await page.evaluate((snapshot) => {
    (window as unknown as { replayStream: EventTarget }).replayStream.dispatchEvent(
      new MessageEvent('snapshot', { data: JSON.stringify({ run: snapshot }) }),
    );
  }, updatedRun);
  await expect(slider).toHaveAttribute('aria-valuenow', '7000');
  await expect(page.getByRole('img', { name: /^执行画面/ })).toHaveAttribute(
    'src',
    /live-frame-7000$/,
  );
  await slider.fill('1000');
  await expect(live).toHaveCount(0);
  await expect(page.getByLabel('回放时间', { exact: true })).toHaveText('00:01 / 00:07');
});

test('uses one replay player and pauses video when leaving execution', async ({
  page,
  browser,
}) => {
  const frames = [0, 1, 2].map((index) =>
    makeScreenshot(run, {
      id: `paused-frame-${index}`,
      stage: 'live',
      elapsedMs: index * 1000,
      contentType: 'image/jpeg',
      size: 1,
    }),
  );

  await mockRun(
    page,
    makeRun({
      artifacts: [
        ...frames,
        { ...frames[0], id: 'video', kind: 'video', contentType: 'video/webm' },
      ],
    }),
  );
  const recordingContext = await browser.newContext({
    recordVideo: { dir: '/private/tmp/testdog-test-video', size: { width: 320, height: 200 } },
  });
  const recordingPage = await recordingContext.newPage();

  await recordingPage.setContent('<p>Replay test</p>');
  await recordingPage.waitForTimeout(1500);
  const recordingVideo = recordingPage.video()!;

  await recordingContext.close();
  const recording = await readFile(await recordingVideo.path());

  await page.route(`**/api/runs/${run.id}/artifacts/*`, (route) => {
    const range = route
      .request()
      .headers()
      .range?.match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Number(range[2]) : recording.length - 1;

    return route.fulfill({
      status: range ? 206 : 200,
      contentType: 'video/webm',
      headers: {
        'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${recording.length}` } : {}),
      },
      body: recording.subarray(start, end + 1),
    });
  });
  await page.goto(`/runs/${run.id}`);
  await expect(page.getByRole('button', { name: '播放回看', exact: true })).toBeEnabled();
  const media = page.getByLabel('执行录像');

  await expect
    .poll(() => media.evaluate((element) => (element as HTMLVideoElement).readyState))
    .toBeGreaterThan(1);
  await page.getByRole('button', { name: '播放回看', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停回看', exact: true })).toBeVisible();
  const timeline = await page.getByTestId('replay-timeline').boundingBox();

  expect(timeline).not.toBeNull();
  await page.mouse.move(timeline!.x + timeline!.width * 0.2, timeline!.y + timeline!.height / 2);
  await page.mouse.down();
  await page.mouse.move(timeline!.x + timeline!.width * 0.65, timeline!.y + timeline!.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: '播放回看', exact: true })).toBeVisible();
  await expect
    .poll(() => media.evaluate((element) => (element as HTMLVideoElement).paused))
    .toBe(true);
  const pausedTime = await media.evaluate((element) => (element as HTMLVideoElement).currentTime);

  await page.waitForTimeout(300);
  await expect
    .poll(() => media.evaluate((element) => (element as HTMLVideoElement).currentTime))
    .toBeCloseTo(pausedTime);
  await page.getByRole('slider', { name: '画面时间轴' }).fill('1000');
  await expect
    .poll(() => media.evaluate((element) => (element as HTMLVideoElement).currentTime))
    .toBeCloseTo(1);
  await page.getByRole('slider', { name: '画面时间轴' }).fill('0');
  await expect(page.getByRole('button', { name: '完整录像', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '画面回看', exact: true })).toHaveCount(0);
  const video = page.getByLabel('执行录像');

  await video.evaluate((element) => {
    (element as HTMLVideoElement).pause = () => {
      element.dataset.pausedByView = 'true';
    };
  });
  await page.getByRole('button', { name: '计划', exact: true }).click();
  await expect(video).toHaveAttribute('data-paused-by-view', 'true');
  await page.getByRole('button', { name: '回放', exact: true }).click();

  await expect(page.getByRole('slider', { name: '画面时间轴' })).toHaveValue('0');
  await expect(page.getByRole('button', { name: '播放回看', exact: true })).toBeVisible();
});

test('fallback polling keeps unchanged details and receives the completed execution', async ({
  page,
}) => {
  let completed = false;
  const conditions: (string | undefined)[] = [];

  await page.route(`**/api/runs/${run.id}{,?*}`, (route) => {
    const condition = route.request().headers()['if-none-match'];

    conditions.push(condition);
    if (condition === '"running"' && !completed)
      return route.fulfill({ status: 304, headers: { ETag: '"running"' } });

    return route.fulfill({
      json: { run: makeRun({ status: completed ? 'passed' : 'running' }) },
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
  await expect(
    page.getByRole('heading', { name: saved.name, exact: true, level: 1 }),
  ).toBeVisible();
  completed = true;
  await page.clock.fastForward(5000);
  await expect(page.getByRole('button', { name: '重新运行', exact: true })).toBeVisible();
});

test('missing execution stops polling and can recover through explicit retry', async ({ page }) => {
  let reads = 0;
  let missing = true;

  await page.clock.install();
  await page.route(`**/api/runs/${run.id}{,?*}`, (route) => {
    reads++;

    return missing
      ? route.fulfill({ status: 404, json: { message: '执行记录不存在。' } })
      : route.fulfill({ json: { run } });
  });
  await page.goto(`/runs/${run.id}`);
  await expect(page.getByRole('alert').filter({ hasText: /^执行记录不存在$/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '返回执行记录', exact: true })).toBeVisible();
  await page.clock.fastForward(100);
  const stoppedAt = reads;

  expect(stoppedAt).toBe(1);
  await page.clock.fastForward(6000);
  expect(reads).toBe(stoppedAt);
  missing = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: saved.name, exact: true, level: 1 }),
  ).toBeVisible();
});

test('retries transient detail errors without requiring a page reload', async ({ page }) => {
  let reads = 0;

  await page.clock.install();
  await page.route(`**/api/runs/${run.id}{,?*}`, (route) => {
    reads++;

    return reads === 1
      ? route.fulfill({ status: 503, json: { message: '执行服务暂时不可用' } })
      : route.fulfill({ json: { run } });
  });
  await page.goto(`/runs/${run.id}`);
  await expect(page.getByText('执行服务暂时不可用')).toBeVisible();
  await page.clock.fastForward(5000);
  await expect(
    page.getByRole('heading', { name: saved.name, exact: true, level: 1 }),
  ).toBeVisible();
  expect(reads).toBe(2);
  await page.clock.fastForward(10000);
  expect(reads).toBe(2);
});

test('invalid execution addresses render the custom 404 page', async ({ page }) => {
  const response = await page.goto('/runs/invalid-id');

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('alert').filter({ hasText: /^页面不存在或已被移除$/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '返回测试工作台', exact: true })).toHaveAttribute(
    'href',
    '/cases',
  );
});

test('case search combines tags and latest status while history uses each execution status', async ({
  page,
}) => {
  const untouched = makeCase({
    id: '62534c46-a8eb-4991-993e-af6df14bece8',
    name: '未运行用例',
    tags: ['SMOKE'],
  });
  const older = {
    ...summary,
    id: '62534c46-a8eb-4991-993e-af6df14bece9',
    status: 'failed' as const,
  };

  await page.route(/\/api\/tests(?:\?.*)?$/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const q = (params.get('q') ?? '').toLowerCase();
    const status = params.get('status') ?? 'all';

    return route.fulfill({
      json: {
        tests: [saved, untouched].filter(
          (item) =>
            `${item.name} ${item.url} ${item.tags.join(' ')}`.toLowerCase().includes(q) &&
            (status === 'all' || (item.id === saved.id ? 'passed' : 'none') === status),
        ),
        latestRuns: [summary],
      },
    });
  });
  await page.route(/\/api\/runs(?:\?.*)?$/, (route) => {
    const status = new URL(route.request().url()).searchParams.get('status');

    return route.fulfill({
      json: { runs: [summary, older].filter((item) => !status || item.status === status) },
    });
  });
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

  await page.route(/\/api\/tests(?:\?.*)?$/, (route) => {
    caseReads++;

    return route.fulfill({ status: 503, json: { message: '用例库暂时不可用' } });
  });
  await page.route(/\/api\/runs(?:\?.*)?$/, (route) => {
    runReads++;

    return route.fulfill({ json: { runs: [summary] } });
  });
  await page.goto('/runs');
  await expect(
    page.getByRole('table').getByRole('link', { name: saved.name, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect.poll(() => runReads).toBeGreaterThan(1);
  expect(caseReads).toBe(0);
  await page.getByRole('link', { name: '测试用例', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '用例库暂时不可用' })).toBeVisible();
  // SWR may revalidate on navigation; the library is requested only after opening it.
  expect(caseReads).toBeGreaterThanOrEqual(1);
});

test('exports complete reports from both history and detail, and allows retry after failure', async ({
  page,
}) => {
  let rejectExport = true;
  const browserLogs: BrowserLog[] = [
    {
      id: 'console',
      kind: 'console',
      message: 'hello',
      at: run.startedAt,
      elapsedMs: 0,
      pageId: 'page-1',
      pageUrl: run.url,
    },
    {
      id: 'network',
      kind: 'network',
      status: 200,
      at: run.startedAt,
      elapsedMs: 1,
      pageId: 'page-1',
      pageUrl: run.url,
    },
  ];
  const logRequests: string[] = [];

  await page.route(`**/api/runs/${run.id}/logs?*`, (route) => {
    const url = new URL(route.request().url());

    if (url.searchParams.get('kind') !== 'all')
      return route.fulfill({ json: { logs: [], nextCursor: null } });
    logRequests.push(url.search);
    const second = url.searchParams.has('cursor');

    return route.fulfill({
      json: { logs: [browserLogs[second ? 1 : 0]], nextCursor: second ? null : '100' },
    });
  });

  await mockLists(page, { tests: [saved] });
  await mockLists(page, { runs: [summary] });
  await page.route(`**/api/runs/${run.id}{,?*}`, (route) => {
    if (rejectExport) {
      rejectExport = false;

      return route.fulfill({ status: 503, json: { message: '报告暂时不可用' } });
    }

    return route.fulfill({ json: { run } });
  });
  await page.goto('/runs');
  const exportMenu = page.getByRole('button', { name: `更多操作：${run.name}`, exact: true });
  const exportButton = page.getByRole('menuitem', { name: `导出 ${run.name} 的结果`, exact: true });

  await exportMenu.click();

  await exportButton.click();
  await expect(page.getByRole('alert').filter({ hasText: '报告暂时不可用' })).toBeVisible();
  // A successful list read must not erase an unrelated export failure.
  const searchResponse = page.waitForResponse((response) =>
    response.url().includes('/api/runs?q='),
  );

  await page.getByRole('textbox', { name: '搜索结果', exact: true }).fill(run.name);
  await searchResponse;
  await expect(exportMenu).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: '报告暂时不可用' })).toBeVisible();
  const listDownload = page.waitForEvent('download');

  await exportMenu.click();
  await exportButton.click();
  const report = await listDownload;

  expect(report.suggestedFilename()).toBe(`testdog-${run.id}.json`);
  expect(JSON.parse(await readFile((await report.path())!, 'utf8'))).toEqual({
    ...run,
    browserLogs,
  });
  await page.goto(`/runs/${run.id}`);
  const detailDownload = page.waitForEvent('download');

  await page.getByRole('button', { name: '导出执行报告', exact: true }).click();
  expect(JSON.parse(await readFile((await (await detailDownload).path())!, 'utf8'))).toEqual({
    ...run,
    browserLogs,
  });
  expect(logRequests).toEqual([
    '?kind=all&limit=100',
    '?kind=all&limit=100&cursor=100',
    '?kind=all&limit=100',
    '?kind=all&limit=100&cursor=100',
  ]);
});

test('quick creation preserves failed prompts and opens generated nodes in the canvas', async ({
  page,
}) => {
  await mockLists(page, { tests: [saved] });
  let fail = true;
  let payload: unknown;

  await page.route('**/api/tests/compile', (route) => {
    payload = route.request().postDataJSON();

    return route.fulfill(
      fail
        ? { status: 502, json: { message: '步骤生成失败' } }
        : {
            json: {
              plan: {
                rootId: 'root',
                nodes: {
                  root: {
                    id: 'root',
                    kind: 'group',
                    goal: '登录',
                    children: ['navigate', 'login'],
                    dependsOn: [],
                  },
                  navigate: {
                    id: 'navigate',
                    kind: 'task',
                    actionType: 'navigate',
                    goal: 'https://example.com',
                    dependsOn: [],
                    requirementIds: [],
                    assertions: [],
                  },
                  login: {
                    id: 'login',
                    kind: 'task',
                    goal: '点击登录',
                    dependsOn: [],
                    requirementIds: [],
                    assertions: [{ description: '显示邮箱表单' }],
                  },
                },
              },
            },
          },
    );
  });
  await page.goto('/cases');
  await expect(page.getByRole('button', { name: '新建测试', exact: true })).toBeVisible();
  const trigger = page.getByRole('button', { name: '快速创建', exact: true });

  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '快速创建' });
  const input = dialog.getByRole('textbox', { name: '测试步骤与预期结果' });
  const generate = dialog.getByRole('button', { name: '生成', exact: true });

  await expect(dialog).toHaveAttribute('data-ui', 'case-prompt-overlay');
  await expect(input).toHaveAttribute('data-ui', 'case-prompt-input');
  const popupBounds = await dialog.boundingBox();
  const contentBounds = await page.locator('#main-content').boundingBox();

  expect(popupBounds!.x).toBe(contentBounds!.x);
  expect(popupBounds!.y).toBe(contentBounds!.y);
  expect(popupBounds!.width).toBe(contentBounds!.width);
  await expect(input).toHaveCSS('padding-left', '40px');

  await expect(input).toBeFocused();
  await expect(generate).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  const goal = '打开 https://example.com，点击登录，验证显示邮箱表单';

  await input.fill(goal);
  await generate.click();
  await expect(dialog.getByRole('alert')).toHaveText('步骤生成失败');
  await expect(input).toHaveValue(goal);
  await expect(page).toHaveURL(/\/cases$/);
  fail = false;
  await input.press('Control+Enter');
  await expect(page).toHaveURL(/\/cases\/editor\//);
  const canvas = page.getByRole('region', { name: '测试画板' });

  await expect(canvas.locator('[data-step-type=act]')).toContainText('点击登录');
  await expect(canvas.locator('[data-step-type=assert]')).toContainText('显示邮箱表单');
  await expect(page.getByText('项变更待审阅')).toHaveCount(0);
  await openSettings(canvas);
  await expect(canvas.getByLabel('网站地址', { exact: true })).toHaveCount(0);
  await expect(canvas.locator('[data-step-type=navigate]')).toContainText('https://example.com');
  expect(payload).toEqual({ goal });
});

for (const mode of ['quick', 'canvas'] as const) {
  test(`${mode} generation can be cancelled and retried without applying a late response`, async ({
    page,
  }) => {
    await mockLists(page, { tests: [], nextCursor: null });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;

    await page.route('**/api/tests/compile', async (route) => {
      const first = ++requests === 1;

      if (first) await pending;
      await route
        .fulfill({
          json: {
            plan: {
              rootId: 'task',
              nodes: {
                task: {
                  id: 'task',
                  kind: 'task',
                  goal: first ? '过期生成结果' : '当前生成结果',
                  dependsOn: [],
                  requirementIds: [],
                  assertions: [],
                },
              },
            },
          },
        })
        .catch(() => {});
    });
    await page.goto('/cases');
    if (mode === 'quick') await page.getByRole('button', { name: '快速创建', exact: true }).click();
    else {
      await page.getByRole('button', { name: '新建测试', exact: true }).click();
      await page.getByRole('button', { name: '描述生成', exact: true }).click();
    }

    const prompt = page.getByRole('dialog');
    const input = prompt.getByRole('textbox', { name: '测试步骤与预期结果' });
    const goal = '打开 https://example.com 检查页面';

    await input.fill(goal);
    await prompt.getByRole('button', { name: '生成', exact: true }).click();
    await expect(prompt.getByRole('button', { name: '取消生成', exact: true })).toBeEnabled();
    await expect.poll(() => requests).toBe(1);
    if (mode === 'quick') await page.keyboard.press('Escape');
    else await prompt.getByRole('button', { name: '取消生成', exact: true }).click();
    await expect(prompt).toBeVisible();
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue(goal);
    await expect(prompt.getByRole('alert')).toContainText('已取消生成');
    await prompt.getByRole('button', { name: '生成', exact: true }).click();
    await expect.poll(() => requests).toBe(2);
    release();
    await expect(page.getByRole('region', { name: '测试画板' })).toContainText('当前生成结果');
    await expect(page.getByText('过期生成结果', { exact: true })).toHaveCount(0);
    if (mode === 'canvas') {
      await page.getByRole('button', { name: '全部拒绝', exact: true }).click();
      await page.getByRole('button', { name: '描述生成', exact: true }).click();
      await expect(input).toHaveValue(goal);
    }
  });
}

test('canvas trials run the draft without saving and reopen an active run', async ({ page }) => {
  const draftId = 'trial-draft';
  const plan: NonNullable<TestRun['plan']> = {
    rootId: 'root',
    nodes: {
      root: { id: 'root', kind: 'group', goal: '未保存修改', children: ['step'], dependsOn: [] },
      step: {
        id: 'step',
        kind: 'task',
        actionType: 'assert',
        goal: '验证未保存的修改：Ada',
        dependsOn: [],
        requirementIds: [],
        assertions: [{ description: '修改 Ada 生效' }],
      },
    },
  };
  const draft = {
    test: saved,
    name: '未保存修改',
    url: 'https://example.com/draft',
    goal: '验证草稿',
    plan,
  };

  await page.addInitScript(
    ({ draftId, draft }) =>
      sessionStorage.setItem(`testdog:case-draft:${draftId}`, JSON.stringify(draft)),
    { draftId, draft },
  );
  let submissions = 0;
  let testWrites = 0;
  let failed = true;
  let trial: TestRun = makeRun({
    status: 'queued',
    testId: undefined,
    steps: [],
    plan,
    name: '未保存修改 · 草稿试跑',
  });

  await page.route(/\/api\/tests(?:\/[^/?]+)?(?:\?.*)?$/, (route) => {
    if (route.request().method() !== 'GET') testWrites++;

    return route.fulfill({ json: { tests: [saved], test: saved } });
  });
  await page.route('**/api/runs', (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { runs: [] } });
    const payload = route.request().postDataJSON();

    expect(payload).toMatchObject({
      draft: {
        name: draft.name,
        plan,
        target: {
          platform: 'web',
          url: '',
          deviceProfile: 'legacy-desktop',
          userAgent: 'Caseforge-Test/1.0',
        },
      },
    });
    expect(payload.testId).toBeUndefined();
    if (failed) return route.fulfill({ status: 503, json: { message: '试跑暂时失败' } });
    submissions++;
    trial = {
      ...trial,
      id: submissions === 1 ? run.id : '62534c46-a8eb-4991-993e-af6df14bece9',
      status: 'queued',
      cancelRequested: false,
    };

    return route.fulfill({ status: 202, json: { run: trial } });
  });
  await page.route('**/api/runs/*/events?*', (route) => route.fulfill({ status: 503 }));
  await page.route(/\/api\/runs\/[^/?]+(?:\?.*)?$/, (route) => {
    if (route.request().method() === 'DELETE')
      trial = { ...trial, status: 'cancelled', cancelRequested: true };

    return route.fulfill({ json: { run: trial } });
  });
  await page.goto(`/cases/editor/${draftId}`);
  const canvas = page.getByRole('region', { name: '测试画板' });
  const start = canvas.getByRole('button', { name: '试跑', exact: true });

  await openSettings(canvas);
  await canvas.getByRole('textbox', { name: 'User-Agent', exact: true }).fill('Caseforge-Test/1.0');
  await canvas.getByRole('button', { name: '收起面板', exact: true }).click();
  await start.click();
  await expect(canvas.getByRole('alert')).toHaveText('试跑暂时失败');
  expect(testWrites).toBe(0);
  failed = false;
  await start.click();
  const dialog = page.getByRole('dialog', { name: /草稿试跑/ });

  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('执行工作台', { exact: true })).toBeVisible();
  for (const name of [
    '步骤',
    '回放',
    '问题',
    '计划',
    '录制脚本',
    'AI 调用',
    '控制台',
    '网络',
    '布局',
  ]) {
    await expect(dialog.getByRole('button', { name, exact: true })).toBeVisible();
  }

  await expect(dialog.getByRole('link', { name: '返回执行记录' })).toHaveCount(0);
  await expect(page).toHaveURL(`/cases/editor/${draftId}`);
  await expect(dialog.getByRole('button', { name: '停止执行' })).toBeVisible();
  await dialog.getByRole('button', { name: '关闭试跑' }).click();
  await expect(dialog).toBeHidden();
  await expect(canvas.locator('[data-step-type=assert]')).toContainText('验证未保存的修改');
  await start.click();
  await expect(dialog).toBeVisible();
  expect(submissions).toBe(1);
  await dialog.getByRole('button', { name: '停止执行' }).click();
  await expect(dialog.getByRole('heading', { name: /已停止/ })).toBeVisible();
  await dialog.getByRole('button', { name: '关闭试跑' }).click();
  await start.click();
  await expect(dialog).toBeVisible();
  expect(submissions).toBe(2);
  expect(testWrites).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(
        (id) => JSON.parse(sessionStorage.getItem(`testdog:case-draft:${id}`)!).name,
        draftId,
      ),
    )
    .toBe('未保存修改');
});

test('web settings choose desktop and mobile devices without changing platform', async ({
  page,
}) => {
  await mockLists(page, { tests: [] });
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).click();
  const canvas = page.getByRole('region', { name: '测试画板' });

  await openSettings(canvas);
  const ua = canvas.getByRole('textbox', { name: 'User-Agent', exact: true });

  await expect(ua).toHaveValue('');
  await ua.fill('Caseforge-Test/1.0');
  const device = canvas.getByRole('combobox', { name: '浏览器与设备' });

  await expect(device).toContainText('桌面');
  await device.click();
  await page.getByRole('option', { name: 'Pixel 7 · Chromium', exact: true }).click();
  await expect(device).toContainText('Pixel 7');
  await expect(canvas.getByRole('button', { name: '收起面板' })).toContainText('Web · Pixel 7');
  await device.click();
  await page.getByRole('option', { name: 'iPhone 13 · WebKit', exact: true }).click();
  await expect(device).toContainText('iPhone 13');
  await device.click();
  await page.getByRole('option', { name: '桌面 · Chromium', exact: true }).click();
  await expect(device).toContainText('桌面');
  await expect(canvas.getByRole('combobox', { name: '平台', exact: true })).toContainText('Web');
  await expect(ua).toHaveValue('Caseforge-Test/1.0');
  await canvas.getByRole('button', { name: '收起面板', exact: true }).click();
  await page.reload();
  await openSettings(canvas);
  await expect(ua).toHaveValue('Caseforge-Test/1.0');
  await ua.clear();
  await canvas.getByRole('button', { name: '收起面板', exact: true }).click();
  await openSettings(canvas);
  await expect(ua).toHaveValue('');
});

test('replay contains portrait landscape square and ultrawide media within the panel', async ({
  page,
}) => {
  let width = 390;
  let height = 844;
  const artifact = makeScreenshot(run, { id: 'ratio-frame', stepId: run.steps[0].id });

  await mockRun(page, makeRun({ artifacts: [artifact] }));
  await page.route(`**/api/runs/${run.id}/artifacts/*`, (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`,
    }),
  );
  for (const dimensions of [
    [390, 844],
    [1920, 1080],
    [800, 800],
    [2560, 1080],
  ]) {
    [width, height] = dimensions;
    await page.goto(`/runs/${run.id}`);
    const image = page.getByRole('img', { name: /^执行画面/ });

    await expect(page.getByText(`${width} × ${height} · BROWSER`, { exact: true })).toBeVisible();
    await expect(image).toHaveCSS('object-fit', 'contain');
    const bounds = await image.boundingBox();
    const surface = await page.locator('[data-ui~="run-replay-surface"]').boundingBox();
    const controls = await page.locator('[data-ui~="run-replay-controls"]').boundingBox();

    expect(bounds!.width).toBeGreaterThan(0);
    expect(bounds!.height).toBeGreaterThan(0);
    expect(bounds!.x).toBeGreaterThanOrEqual(surface!.x);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(controls!.y);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(surface!.x + surface!.width);
  }
});

test('dialogs support keyboard entry, Escape dismissal and focus restoration', async ({ page }) => {
  await mockLists(page, { tests: [saved] });
  await mockLists(page, { runs: [summary] });
  await page.goto('/cases');
  const create = page.getByRole('button', { name: '新建测试', exact: true });

  await create.focus();
  await create.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-ui~="case-canvas-page"]')).toBeVisible();
  await page.getByRole('link', { name: '测试用例', exact: true }).first().click();
  const more = page.getByRole('button', { name: `更多操作：${saved.name}`, exact: true });

  await more.focus();
  await more.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  await more.press('Enter');
  const remove = page.getByRole('menuitem', { name: `删除 ${saved.name}`, exact: true });

  await remove.focus();
  await remove.press('Enter');
  const dialog = page.getByRole('dialog');

  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(more).toBeFocused();
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

    if (request.url().endsWith('/compile')) {
      const goal = request.postDataJSON().goal;

      return route.fulfill({
        json: {
          plan: {
            rootId: 'root',
            nodes: {
              root: {
                id: 'root',
                kind: 'task',
                goal,
                dependsOn: [],
                requirementIds: [],
                assertions: [],
              },
            },
          },
        },
      });
    }

    if (rejectSave) {
      rejectSave = false;

      return route.fulfill({ status: 503, json: { message: '保存暂时失败' } });
    }

    const body = request.postDataJSON();

    writes.push({ method: request.method(), body });
    if (request.method() === 'POST')
      tests = [makeCase({ ...body, id: `${saved.id.slice(0, -1)}${writes.length}` }), ...tests];
    else tests = tests.map((item) => (item.id === saved.id ? { ...item, ...body } : item));

    return route.fulfill({ json: { test: tests[0] } });
  });
  await mockLists(page, { runs: [summary] });
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).click();
  const dialog = page.locator(
    '[data-ui~="case-canvas-page"], [role=dialog]:not(#case-prompt-section)',
  );

  await dialog.getByRole('button', { name: '描述生成', exact: true }).click();
  await dialog.getByLabel('测试步骤与预期结果').fill('验证首页');
  await dialog.getByRole('button', { name: '生成', exact: true }).click();
  await dialog.getByRole('button', { name: '全部接受' }).click();
  await openSettings(dialog);
  await dialog.getByLabel('测试名称').fill('新用例');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('保存暂时失败');
  await expect(dialog.getByLabel('测试名称')).toHaveValue('新用例');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '更多操作：验证登录', exact: true }).click();
  await page.getByRole('menuitem', { name: '编辑 验证登录', exact: true }).click();
  await dialog.getByRole('button', { name: '描述生成', exact: true }).click();
  await dialog.getByRole('button', { name: '生成', exact: true }).click();
  await dialog.getByRole('button', { name: '全部接受' }).click();
  await openSettings(dialog);
  await dialog.getByLabel('测试名称').fill('更新登录');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '更多操作：更新登录', exact: true }).click();
  await page.getByRole('menuitem', { name: '复制 更新登录', exact: true }).click();
  await openSettings(dialog);
  await expect(dialog.getByLabel('测试名称')).toHaveValue('更新登录（副本）');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes.map((item) => item.method)).toEqual(['POST', 'PATCH', 'POST']);
  expect(writes[2].body.tags).toEqual(['登录']);
  await page.getByRole('button', { name: '更多操作：更新登录', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除 更新登录', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: '删除测试', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('删除暂时失败');
  await dialog.getByRole('button', { name: '删除测试', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '更新登录', exact: true })).toHaveCount(0);
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

  await mockRun(page, makeRun({ plan, steps: [{ ...run.steps[0], planNodeId: 'open' }] }));
  await page.goto(`/runs/${run.id}`);
  await page.getByRole('button', { name: '计划', exact: true }).click();
  const dependency = page.locator('.react-flow__edge[aria-label="依赖：open → check"]');

  // A straight vertical SVG path has zero bounding-box width. Verify the drawn
  // path instead of Playwright's box-based visibility check on its <g> wrapper.
  const expectDependency = async () => {
    await expect(dependency).toHaveCSS('visibility', 'visible');
    await expect
      .poll(() =>
        dependency
          .locator('.react-flow__edge-path')
          .evaluate((element) => (element as SVGPathElement).getTotalLength()),
      )
      .toBeGreaterThan(0);
  };

  await expectDependency();
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', { name: '步骤', exact: true }).click();
    await expect(page.locator('.react-flow__node').first()).toBeHidden();
    await expect(page.locator('[data-ui~="plan-viewport"]')).toBeHidden();
    await page.getByRole('button', { name: '计划', exact: true }).click();
    await expectDependency();
  }

  await expect(page.getByRole('button', { name: '依赖连线', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '查看节点 open', exact: true }).click();
  const detail = page.locator('[data-plan-node="open"] [data-ui~="plan-inline-evidence"]');
  const viewport = page.locator('[data-ui~="plan-viewport"]');

  await viewport.focus();
  await viewport.press('ArrowRight');
  await expect(detail.getByRole('button', { name: /打开网站/ })).toBeVisible();
  await detail.getByRole('button', { name: /打开网站/ }).click();
  await page.getByRole('button', { name: '步骤', exact: true }).click();
  await expect(
    page
      .locator('section[aria-label="步骤"]')
      .getByRole('heading', { name: '打开网站', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '回放', exact: true })).toHaveAttribute(
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

  await mockRun(page, run);
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
  await page.getByRole('button', { name: '录制脚本', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Playwright 录制脚本' });
  const save = page.getByRole('button', { name: '保存版本', exact: true });

  await expect(save).toBeEnabled();
  await page.clock.pauseAt(new Date(Date.now() + 3600000));
  await editor.fill('invalid script');
  await expect(save).toBeDisabled();
  await page.clock.fastForward(300);
  const editorRegion = page.getByRole('region', { name: '录制脚本编辑器' });

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

  await mockRun(page, run);
  await page.route(`**/api/runs/${run.id}/recording`, (route) => {
    versionReads++;

    return route.fulfill({ json: { versions: [] } });
  });
  await page.goto(`/runs/${run.id}`);
  await expect(
    page.getByRole('heading', { name: saved.name, exact: true, level: 1 }),
  ).toBeVisible();
  expect(versionReads).toBe(0);
  await page.getByRole('button', { name: '录制脚本', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Playwright 录制脚本' });

  await expect(editor).toBeVisible();
  const draft = 'await page1.goto("https://example.com/changed");';

  await editor.fill(draft);
  await page.getByRole('button', { name: '回放', exact: true }).click();
  await expect(editor).toBeHidden();
  await page.getByRole('button', { name: '录制脚本', exact: true }).click();
  await expect(editor).toHaveText(draft);
  expect(versionReads).toBe(1);
});

test('plan subflows retain both branch paths, shared references and external dependencies', async ({
  page,
}) => {
  const task = (id: string) => ({
    id,
    kind: 'task' as const,
    goal: id,
    dependsOn: [],
    requirementIds: [],
    assertions: [],
  });
  const plan: NonNullable<TestRun['plan']> = {
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
  await mockRun(
    page,
    makeRun({ plan, steps: [{ ...run.steps[0], planNodeId: 'shared', status: 'failed' }] }),
  );
  await page.goto(`/runs/${run.id}`);
  await page.getByRole('button', { name: '计划', exact: true }).click();
  await expect(
    page.locator('.react-flow').getByText('YES / 条件成立', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.react-flow').getByText('NO / 条件不成立', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.react-flow__edge[aria-label="依赖：external → root"]')).toBeVisible();
  const dependency = page.locator(
    '.react-flow__edge[aria-label="依赖：external → root"] .react-flow__edge-path',
  );
  const ends = await dependency.evaluate((element) => {
    const path = element as SVGPathElement;
    const start = path.getPointAtLength(0);
    const end = path.getPointAtLength(path.getTotalLength());

    return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
  });
  const source = page.locator('[data-testid="rf__node-plan:external"]');
  const target = page.locator('[data-testid="rf__node-plan:root"]');
  const position = async (node: Locator) =>
    node.evaluate((element) => {
      const match = element.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/)!;

      return {
        x: Number(match[1]),
        y: Number(match[2]),
        width: (element as HTMLElement).offsetWidth,
        height: (element as HTMLElement).offsetHeight,
      };
    });
  const from = await position(source);
  const to = await position(target);

  expect(ends.start.x).toBeCloseTo(from.x + from.width / 2, 0);
  expect(Math.abs(ends.start.y - from.y - from.height)).toBeLessThanOrEqual(4);
  expect(ends.end.x).toBeCloseTo(to.x + to.width / 2, 0);
  expect(Math.abs(ends.end.y - to.y)).toBeLessThanOrEqual(4);
  await expect(
    page.locator('[data-plan-node="shared"] [data-slot="status"][data-status="failed"]'),
  ).toHaveCount(2);
  await page.getByRole('button', { name: '查看引用节点 shared', exact: true }).click();
  const detail = page.locator(
    '[data-plan-node="shared"][data-reference="true"] [data-ui~="plan-inline-evidence"]',
  );

  await expect(detail.getByRole('button', { name: /打开网站/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '重置', exact: true })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: '计划节点详情' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('preserves SSE updates across stale reads and resumes polling after disconnect', async ({
  page,
}) => {
  const activeRun = makeRun({
    status: 'running' as const,
    finishedAt: undefined,
    durationMs: undefined,
    steps: [],
    realtimeRevision: 1,
  });
  let reads = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.clock.install();
  await page.route(`**/api/runs/${run.id}{,?*}`, async (route) => {
    if (route.request().method() === 'DELETE') return route.fulfill({ json: {} });
    reads++;
    if (reads === 2) await pending;

    return route.fulfill({ json: { run: activeRun } });
  });
  await page.addInitScript((snapshot) => {
    const streams: EventTarget[] = [];

    Object.assign(window, { __testdogStreams: streams });
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
    () => (window as unknown as { __testdogStreams: EventTarget[] }).__testdogStreams.length > 0,
  );
  // A healthy stream disables periodic reads even as the elapsed-time clock ticks.
  await page.clock.fastForward(5500);
  expect(reads).toBe(1);
  await page.getByRole('button', { name: '停止执行', exact: true }).click();
  await expect.poll(() => reads).toBe(2);
  await page.evaluate((step) => {
    const streams = (window as unknown as { __testdogStreams: EventTarget[] }).__testdogStreams;

    streams.at(-1)!.dispatchEvent(
      new MessageEvent('updates', {
        data: JSON.stringify([
          { kind: 'step', revision: 2, data: { ...step, title: '推送新增步骤' } },
        ]),
      }),
    );
  }, run.steps[0]);
  await expect(
    page.getByRole('region', { name: '步骤' }).getByRole('button', { name: /推送新增步骤/ }),
  ).toBeVisible();
  release();
  await expect(page.getByRole('button', { name: '停止执行', exact: true })).toBeEnabled();
  await expect(
    page.getByRole('region', { name: '步骤' }).getByRole('button', { name: /推送新增步骤/ }),
  ).toBeVisible();
  // A subsequent HTTP request is also older than the version already in the cache.
  await page.getByRole('button', { name: '停止执行', exact: true }).click();
  await expect.poll(() => reads).toBe(3);
  await expect(page.getByRole('button', { name: '停止执行', exact: true })).toBeEnabled();
  await expect(
    page.getByRole('region', { name: '步骤' }).getByRole('button', { name: /推送新增步骤/ }),
  ).toBeVisible();
  await page.evaluate(() => {
    const streams = (
      window as unknown as { __testdogStreams: (EventTarget & { onerror: () => void })[] }
    ).__testdogStreams;

    streams.at(-1)!.onerror();
  });
  await page.clock.runFor(5500);
  await expect.poll(() => reads).toBe(4);
  await expect(
    page.getByRole('region', { name: '步骤' }).getByRole('button', { name: /推送新增步骤/ }),
  ).toBeVisible();
});

test('dockview manages tab ordering and browser log activation', async ({ page }) => {
  const errors: string[] = [];
  const logReads: string[] = [];

  page.on('pageerror', (error) => errors.push(error.message));
  await mockRun(page, run);
  await page.route(`**/api/runs/${run.id}/logs?*`, (route) => {
    logReads.push(new URL(route.request().url()).searchParams.get('kind')!);

    return route.fulfill({ json: { logs: [], nextCursor: null } });
  });
  await page.goto(`/runs/${run.id}`);
  const dock = page.getByLabel('执行工作台', { exact: true });

  await expect(dock.locator('.dv-tabs-container').first().locator('.dv-tab')).toHaveCount(3);
  expect(logReads).toEqual([]);
  const tabs = dock.locator('.dv-tabs-container').first();
  const plan = tabs.locator('.dv-tab').filter({ hasText: '计划' });
  const execution = tabs.locator('.dv-tab').filter({ hasText: '步骤' });

  await plan.dragTo(execution, { targetPosition: { x: 2, y: 20 } });
  await expect(tabs.locator('.dv-tab').first()).toContainText('计划');
  await page.getByRole('button', { name: '回放', exact: true }).click();
  await page.getByRole('button', { name: '控制台', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Console 记录', exact: true })).toBeVisible();
  expect(logReads).toContain('console');
  expect(logReads).not.toContain('network');
  await page.getByRole('button', { name: '网络', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Network 记录', exact: true })).toBeVisible();
  expect(logReads).toContain('network');
  await page.getByRole('button', { name: 'AI 调用', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Console 记录', exact: true })).toBeHidden();
  await expect(page.getByRole('region', { name: 'Network 记录', exact: true })).toBeVisible();
  await expect(dock.locator('[data-ui~="dock"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('layout popover switches presets and restores the default', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(error.message));
  await mockRun(page, run);
  await page.route(`**/api/runs/${run.id}/logs?*`, (route) =>
    route.fulfill({ json: { logs: [], nextCursor: null } }),
  );
  await page.goto(`/runs/${run.id}`);
  const studio = page.getByLabel('执行工作台', { exact: true });
  const trigger = page.getByRole('button', { name: '布局', exact: true });

  for (const preset of ['审阅', '问题', '调试']) {
    await trigger.click();
    await page.getByRole('dialog').getByRole('button', { name: preset, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(studio.locator('.dv-groupview')).toHaveCount(4);
  }

  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('button', { name: '专注模式', exact: true }).click();
  await expect(studio.locator('.dv-groupview')).toHaveCount(1);
  await trigger.click();
  await page.getByRole('button', { name: '恢复默认布局' }).click();
  await expect(studio.locator('.dv-groupview')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('execution studio opens a full height three pane layout', async ({ page }) => {
  await mockRun(page, run);
  await page.goto(`/runs/${run.id}`);
  const studio = page.getByLabel('执行工作台', { exact: true });

  await expect(studio).toBeVisible();
  await expect(page.locator('section[aria-label="步骤"]')).toBeVisible();
  const left = await page.getByRole('button', { name: '步骤', exact: true }).boundingBox();
  const right = await page.getByRole('button', { name: '回放', exact: true }).boundingBox();
  const trace = page.getByRole('button', { name: 'AI 调用', exact: true });
  const bottom = await page.getByRole('button', { name: '控制台', exact: true }).boundingBox();

  const consoleTab = await page.getByRole('button', { name: '控制台', exact: true }).boundingBox();
  const networkTab = await page.getByRole('button', { name: '网络', exact: true }).boundingBox();

  const bounds = await studio.boundingBox();
  const replayGroup = studio
    .locator('.dv-groupview')
    .filter({ has: page.getByRole('button', { name: '回放', exact: true }) });
  const groupBounds = await replayGroup.boundingBox();

  await expect(replayGroup.getByRole('button', { name: 'AI 调用', exact: true })).toBeVisible();
  expect((await trace.boundingBox())!.x).toBeGreaterThan(right!.x);
  expect((groupBounds!.x - bounds!.x) / bounds!.width).toBeCloseTo(0.382, 2);
  expect(consoleTab!.y).toBe(bottom!.y);
  expect(networkTab!.y).toBe(bottom!.y);
  expect(left!.x).toBeLessThan(right!.x);
  expect(bottom!.x).toBe(right!.x);
  expect(bottom!.y).toBeGreaterThan(right!.y);
  await page.screenshot({ path: 'artifacts/run-studio.png', fullPage: true });
  for (const width of [1600, 1000]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(async () => {
        const workspace = await studio.boundingBox();
        const replay = await replayGroup.boundingBox();

        return (replay!.x - workspace!.x) / workspace!.width;
      })
      .toBeCloseTo(0.382, 2);
  }
});

test('planned steps contain execution actions and preserve details across views', async ({
  page,
}) => {
  const task = (id: string, goal: string) => ({
    id,
    kind: 'task' as const,
    goal,
    dependsOn: [],
    requirementIds: [],
    assertions: [],
  });
  const plan = {
    rootId: 'root',
    nodes: {
      root: {
        id: 'root',
        kind: 'group' as const,
        goal: '验证页面',
        children: ['open', 'later'],
        dependsOn: [],
      },
      open: task('open', '访问目标页面'),
      later: task('later', '验证后续结果'),
    },
  };

  await mockRun(
    page,
    makeRun({
      plan,
      steps: [
        makeStep(run, { id: 'setup', title: '初始化浏览器' }),
        { ...run.steps[0], planNodeId: 'open' },
      ],
    }),
  );
  await page.goto(`/runs/${run.id}`);
  const steps = page.locator('section[aria-label="步骤"]');

  await expect(steps.getByText('用例快照', { exact: true })).toHaveCount(0);
  const plannedTrigger = steps.getByRole('button', { name: /访问目标页面/ });
  const planned = plannedTrigger.locator('..');
  const pendingTrigger = steps.getByRole('button', { name: /验证后续结果/ });

  await expect(plannedTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(pendingTrigger).toContainText('暂无动作');
  await expect(steps.getByRole('button', { name: /初始化浏览器/ })).toBeVisible();
  const action = planned.getByRole('button', { name: /打开网站/ });

  await expect(action).toHaveAttribute('aria-expanded', 'true');
  await action.click();
  await expect(action).toHaveAttribute('aria-expanded', 'false');
  await action.click();
  await expect(planned.getByText('action: navigate', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '计划', exact: true }).click();
  const node = page.locator('[data-plan-node="open"]');

  await node.getByRole('button', { name: '展开动作', exact: true }).click();
  await expect(node.getByRole('button', { name: /打开网站/ })).toBeVisible();
  await page.getByRole('button', { name: '步骤', exact: true }).click();
  await expect(plannedTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(action).toHaveAttribute('aria-expanded', 'true');
});

test('nested execution groups preserve action state and references reveal collapsed ancestors', async ({
  page,
}) => {
  const plan = {
    rootId: 'root',
    nodes: {
      root: {
        id: 'root',
        kind: 'group' as const,
        goal: '隐藏根分组',
        children: ['outer', 'branch'],
        dependsOn: [],
      },
      outer: {
        id: 'outer',
        kind: 'group' as const,
        goal: '一级分组',
        children: ['inner'],
        dependsOn: [],
      },
      inner: {
        id: 'inner',
        kind: 'group' as const,
        goal: '二级分组',
        children: ['open'],
        dependsOn: [],
      },
      open: {
        id: 'open',
        kind: 'task' as const,
        goal: '访问目标页面',
        dependsOn: [],
        requirementIds: [],
        assertions: [],
      },
      branch: {
        id: 'branch',
        kind: 'branch' as const,
        condition: '再次检查页面',
        then: 'open',
        dependsOn: [],
      },
    },
  };

  await mockRun(page, makeRun({ plan, steps: [{ ...run.steps[0], planNodeId: 'open' }] }));
  await page.goto(`/runs/${run.id}`);
  const steps = page.locator('section[aria-label="步骤"]');
  const triggers = steps.locator('[data-slot="collapsible-trigger"]');
  const outer = triggers.filter({ hasText: '一级分组' });
  const inner = triggers.filter({ hasText: '二级分组' });
  const task = triggers.filter({ hasText: '访问目标页面' });
  const action = steps.getByRole('button', { name: /打开网站/ });

  await expect(steps.getByText('隐藏根分组', { exact: true })).toHaveCount(0);
  await expect(action).toHaveAttribute('aria-expanded', 'true');
  await inner.focus();
  await page.keyboard.press('Space');
  await expect(inner).toHaveAttribute('aria-expanded', 'false');
  await outer.click();
  await expect(outer).toHaveAttribute('aria-expanded', 'false');
  await triggers.filter({ hasText: '再次检查页面' }).click();
  await steps.getByRole('button', { name: /YES.*访问目标页面/ }).click();

  await expect(outer).toHaveAttribute('aria-expanded', 'true');
  await expect(inner).toHaveAttribute('aria-expanded', 'true');
  await expect(task).toBeFocused();
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute('aria-expanded', 'true');
});

test('bottom browser logs start collapsed and expand on tab selection', async ({ page }) => {
  await mockRun(page, run);
  await page.route(`**/api/runs/${run.id}/logs?*`, (route) =>
    route.fulfill({ json: { logs: [], nextCursor: null } }),
  );
  await page.goto(`/runs/${run.id}`);
  const logs = page.getByRole('button', { name: '控制台', exact: true });
  const group = page.locator('.dv-groupview').filter({ has: logs });

  await expect(logs).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('AI 调用内容', { exact: true })).toHaveCount(0);
  expect((await group.boundingBox())!.height).toBeLessThanOrEqual(41);
  await logs.click();
  await expect(logs).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('region', { name: 'Console 记录', exact: true })).toBeVisible();
  expect((await group.boundingBox())!.height).toBeGreaterThan(200);
  await logs.click();
  await expect(logs).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: '控制台', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Console 记录', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '网络', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Network 记录', exact: true })).toBeVisible();
  for (const name of ['控制台', '网络', '控制台', '网络']) {
    const tab = page.getByRole('button', { name, exact: true });

    await tab.focus();
    await tab.press('Enter');
    await expect(tab).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByRole('region', {
        name: `${name === '控制台' ? 'Console' : 'Network'} 记录`,
        exact: true,
      }),
    ).toBeVisible();
  }
});

test('group header actions maximize restore and collapse each group', async ({ page }) => {
  await mockRun(page, run);
  await page.route(`**/api/runs/${run.id}/logs?*`, (route) =>
    route.fulfill({ json: { logs: [], nextCursor: null } }),
  );
  await page.goto(`/runs/${run.id}`);
  for (const name of ['步骤', '回放', '控制台']) {
    const tab = page.locator('[data-ui~="dock-tab-button"]').filter({ hasText: name });
    const group = page.locator('.dv-groupview').filter({ has: tab });

    await group.locator('.dv-tabs-and-actions-container').hover();
    if (await group.getByRole('button', { name: '展开分组' }).count()) {
      await group.getByRole('button', { name: '展开分组' }).click();
    }

    const before = (await group.boundingBox())!;

    await group.getByRole('button', { name: '最大化分组' }).click();
    await expect(group.getByRole('button', { name: '还原分组' })).toBeVisible();
    expect((await group.boundingBox())!.width).toBeGreaterThan(before.width);
    await group.getByRole('button', { name: '还原分组' }).click();
    await expect
      .poll(async () => Math.abs((await group.boundingBox())!.height - before.height), {
        message: name + ' restore',
      })
      .toBeLessThan(3);
    await group.locator('.dv-tabs-and-actions-container').hover();
    await group.getByRole('button', { name: '最大化分组' }).click();
    await group.getByRole('button', { name: '折叠分组' }).click();
    await expect(group.getByRole('button', { name: '展开分组' })).toBeVisible();
    const folded = (await group.boundingBox())!;

    expect(name === '步骤' ? folded.width : folded.height).toBeLessThanOrEqual(41);
    await group.getByRole('button', { name: '展开分组' }).click();
    const after = (await group.boundingBox())!;

    expect(Math.abs(after.width - before.width)).toBeLessThan(3);
    expect(
      Math.abs(after.height - before.height),
      `${name}: ${before.height} → ${after.height}`,
    ).toBeLessThan(3);
  }
});

test('creates typed steps through canvas insertion points in a dedicated canvas', async ({
  page,
}) => {
  let stored: TestCase | undefined;

  await page.route('**/api/tests*', async (route) => {
    if (route.request().method() === 'POST') {
      stored = makeCase({ ...route.request().postDataJSON() });
      await route.fulfill({ json: { test: stored }, status: 201 });
    } else await route.fulfill({ json: { tests: stored ? [stored] : [], nextCursor: null } });
  });
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).first().click();
  const dialog = page.locator(
    '[data-ui~="case-canvas-page"], [role=dialog]:not(#case-prompt-section)',
  );

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(dialog.getByLabel('测试步骤与预期结果')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '描述生成', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '返回文本' })).toHaveCount(0);
  await dialog.screenshot({ path: 'artifacts/ui/case-text-entry.png' });
  await openSettings(dialog);
  await dialog.getByLabel('测试名称', { exact: true }).fill('GitHub repository smoke test');
  await expect(dialog.getByLabel('网站地址', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '收起面板' }).click();
  await expect(dialog.getByLabel('网站地址', { exact: true })).toBeHidden();
  const canvas = await dialog.locator('[data-ui~="plan-viewport"]').boundingBox();

  expect(canvas!.height).toBeGreaterThan(600);
  expect(canvas!.width).toBeGreaterThan(700);
  await expect(dialog.locator('.case-editor-header')).toHaveCount(0);
  const panel = dialog.getByRole('complementary', { name: '测试面板' });

  await expect(panel.getByRole('button', { name: '保存' })).toBeVisible();
  const panelBounds = await panel.boundingBox();

  expect(panelBounds!.height).toBeLessThan(100);
  await expect(panel.getByRole('button', { name: '展开面板' })).toBeVisible();
  expect(canvas!.width).toBeGreaterThan(1000);
  await expect(dialog.getByRole('button', { name: '添加操作', exact: true })).toHaveCount(0);
  const content = [
    ['Act', 'Open the tester-army/e2e repository page'],
    ['Assert', 'Verify the repository name, description and file listing are visible'],
    ['Login', '使用 tester@example.com 和 测试密码 登录'],
    ['Files', '打开 README 文件'],
    ['Screenshot', '截取当前页面'],
    ['Navigate', 'https://github.com/tester-army/e2e'],
  ];

  for (const [index, [type, text]] of content.entries()) {
    await dialog
      .getByRole('button', { name: `在 root 的第 ${index + 1} 个位置添加节点`, exact: true })
      .click();
    await page
      .getByRole('menuitem')
      .filter({ hasText: new RegExp(`^${type}`) })
      .click();
    await dialog
      .locator(`[data-step-type="${type.toLowerCase()}"] [data-ui~="plan-content-button"]`)
      .last()
      .click();
    await dialog.getByRole('textbox', { name: /^节点内容/ }).fill(text);
    await dialog.getByRole('textbox', { name: /^节点内容/ }).press('Enter');
  }

  await expect(dialog.locator('[data-step-type="assert"]')).toContainText(content[1][1]);
  // Insertion at the first slot changes execution order, rather than always appending.
  await dialog.getByRole('button', { name: '在 root 的第 1 个位置添加节点', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: /^Act/ }).click();
  await dialog.locator('[data-step-type=act] [data-ui~="plan-content-button"]').first().click();
  await dialog.getByRole('textbox', { name: /^节点内容/ }).fill('检查前置环境');
  await dialog.getByRole('textbox', { name: /^节点内容/ }).press('Enter');
  await expect(page).toHaveURL(/\/cases\/editor\//);
  await expect(page.getByRole('navigation', { name: '工作区导航' })).toBeVisible();
  const breadcrumb = page.getByRole('navigation', { name: '面包屑' });

  await expect(breadcrumb.getByRole('link', { name: '测试用例', exact: true })).toHaveAttribute(
    'href',
    '/cases',
  );
  await expect(breadcrumb).toContainText('画板');
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(dialog.locator('.plan-board-toolbar')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: '计划节点详情' })).toHaveCount(0);
  const first = dialog.locator('[data-step-type=act]').first();
  const firstId = (await first.getAttribute('data-plan-node'))!;

  await first.hover();
  await first.getByRole('button', { name: `复制节点 ${firstId}`, exact: true }).click();
  await expect(dialog.locator('[data-step-type=act]')).toHaveCount(3);
  const copy = dialog.locator('[data-step-type=act]').nth(1);
  const copyId = (await copy.getAttribute('data-plan-node'))!;

  await copy.hover();
  await copy.getByRole('button', { name: `删除节点 ${copyId}`, exact: true }).click();
  await expect(dialog.locator('[data-step-type=act]')).toHaveCount(2);
  await first.hover();
  await first
    .getByRole('button', { name: `拖拽节点 ${firstId}`, exact: true })
    .dragTo(dialog.getByRole('button', { name: '在 root 的第 8 个位置添加节点', exact: true }));
  await expect(dialog.locator('[data-step-type=act]').last()).toContainText('检查前置环境');
  const moved = dialog.locator(`[data-plan-node="${firstId}"]`);

  await moved.hover();
  await moved
    .getByRole('button', { name: `拖拽节点 ${firstId}`, exact: true })
    .dragTo(dialog.getByRole('button', { name: '在 root 的第 1 个位置添加节点', exact: true }));
  await expect(dialog.locator('[data-step-type=act]').first()).toContainText('检查前置环境');
  await page.reload();
  await expect(dialog.locator('[data-step-type=screenshot]')).toContainText('截取当前页面');
  await openSettings(dialog);
  await expect(dialog.getByLabel('网站地址', { exact: true })).toHaveCount(0);
  await expect(dialog.locator('[data-step-type=navigate]')).toContainText(
    'https://github.com/tester-army/e2e',
  );
  await page.screenshot({ path: 'artifacts/ui/case-canvas-settings.png' });
  await dialog.getByRole('button', { name: '收起面板' }).click();
  await dialog
    .locator('[data-ui~="plan-board"]')
    .screenshot({ path: 'artifacts/ui/case-tree-editor.png' });

  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toBeHidden();
  const root = stored!.plan!.nodes.root;

  expect(root.kind).toBe('group');
  if (root.kind !== 'group') throw new Error('Missing group');
  expect(stored!.plan!.nodes[root.children[0]]).toMatchObject({
    goal: '检查前置环境',
    actionType: 'act',
  });
  expect(
    root.children.map((id) =>
      stored!.plan!.nodes[id].kind === 'task'
        ? (
            stored!.plan!.nodes[id] as Extract<
              import('@testdog/contracts/automation/compiler/schema').PlanNode,
              { kind: 'task' }
            >
          ).actionType
        : '',
    ),
  ).toEqual(['act', 'act', 'assert', 'login', 'files', 'screenshot', 'navigate']);
  await page.getByRole('button', { name: 'GitHub repository smoke test', exact: true }).click();
  await dialog.getByRole('button', { name: `编辑节点 ${root.children[2]}`, exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: /^节点内容/ })).toHaveValue(content[1][1]);
  await expect(dialog.locator('[data-step-type=assert]')).toContainText('Assert');
  expect(errors).toEqual([]);
});

test('converts text to independent action and assertion cards and preserves failed drafts', async ({
  page,
}) => {
  await page.route('**/api/tests*', (route) =>
    route.fulfill({ json: { tests: [], nextCursor: null } }),
  );
  let fail = true;

  await page.route('**/api/tests/compile', (route) =>
    route.fulfill(
      fail
        ? { status: 500, json: { message: '转换失败' } }
        : {
            json: {
              plan: {
                rootId: 'a',
                nodes: {
                  a: {
                    id: 'a',
                    kind: 'task',
                    goal: '点击登录',
                    dependsOn: [],
                    requirementIds: [],
                    assertions: [{ description: '显示邮箱表单' }],
                  },
                },
              },
            },
          },
    ),
  );
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).first().click();
  const dialog = page.locator(
    '[data-ui~="case-canvas-page"], [role=dialog]:not(#case-prompt-section)',
  );

  await dialog.getByRole('button', { name: '描述生成', exact: true }).click();
  await dialog.getByLabel('测试步骤与预期结果').fill('打开 https://example.com 点击登录并检查表单');
  await expect(page.getByRole('dialog', { name: '描述测试' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog.getByLabel('测试步骤与预期结果')).toHaveCount(0);
  await dialog.getByRole('button', { name: '描述生成', exact: true }).click();
  await expect(dialog.getByLabel('测试步骤与预期结果')).toHaveValue(
    '打开 https://example.com 点击登录并检查表单',
  );
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('button', { name: '描述生成', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: '描述生成', exact: true }).click();
  await dialog.getByLabel('测试步骤与预期结果').click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await dialog.getByRole('button', { name: '描述生成', exact: true }).click();
  await expect(dialog.getByLabel('测试步骤与预期结果')).toHaveValue(
    '打开 https://example.com 点击登录并检查表单',
  );
  await dialog.getByRole('button', { name: '生成', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('测试步骤与预期结果')).toHaveValue(
    '打开 https://example.com 点击登录并检查表单',
  );
  fail = false;
  await dialog.getByRole('button', { name: '生成', exact: true }).click();
  await expect(dialog.locator('[data-step-type="act"]')).toContainText('点击登录');
  await expect(dialog.locator('[data-step-type="assert"]')).toContainText('显示邮箱表单');
  await expect(dialog.getByRole('button', { name: '保存' })).toBeDisabled();
  await dialog.getByRole('button', { name: '全部接受' }).click();
  await dialog.getByRole('button', { name: '编辑节点 a:act', exact: true }).click();
  await dialog.getByRole('textbox', { name: /^节点内容/ }).fill('点击邮箱登录');
  await dialog.getByRole('textbox', { name: /^节点内容/ }).press('Enter');
  await expect(dialog.locator('[data-plan-node="a:act"]')).toContainText('点击邮箱登录');
  await dialog.getByRole('button', { name: '编辑节点 a:act', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: /^节点内容/ })).toHaveValue('点击邮箱登录');
  await dialog.getByRole('textbox', { name: /^节点内容/ }).press('Escape');
  await dialog.getByRole('button', { name: '描述调整', exact: true }).click();
  await dialog.getByLabel('测试步骤与预期结果').fill('补充登录验证');
  const request = page.waitForRequest('**/api/tests/compile');

  await dialog.getByRole('button', { name: '预览', exact: true }).click();
  expect((await request).postDataJSON().currentPlan.nodes['a:act'].goal).toBe('点击邮箱登录');
  await dialog.getByRole('button', { name: '全部拒绝' }).click();
  await expect(dialog.locator('[data-plan-node="a:act"]')).toContainText('点击邮箱登录');
  await dialog.getByRole('button', { name: '描述调整', exact: true }).click();
  await dialog.getByRole('button', { name: '预览', exact: true }).click();
  await dialog.getByRole('button', { name: '全部接受' }).click();
  await expect(dialog.locator('[data-plan-node="a:act"]')).toContainText('点击登录');
  await dialog.getByRole('button', { name: '撤销生成' }).click();
  await expect(dialog.locator('[data-plan-node="a:act"]')).toContainText('点击邮箱登录');
  await dialog.getByRole('button', { name: '在 a 的第 2 个位置添加节点', exact: true }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(dialog).toBeVisible();
});

test('adds adjacent groups as columns with independent insertion points', async ({
  page,
}, testInfo) => {
  await page.route('**/api/tests*', (route) =>
    route.fulfill({ json: { tests: [], nextCursor: null } }),
  );
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/cases');
  await page.getByRole('button', { name: '新建测试', exact: true }).first().click();
  const canvas = page.locator('[data-ui~="case-canvas-page"]');

  const groups = canvas.locator('[data-step-type=group]:not([data-plan-node=root])');
  const groupIds: string[] = [];

  for (const count of [1, 2]) {
    await canvas
      .getByRole('button', { name: '在 root 的第 1 个位置添加节点', exact: true })
      .click();
    await page
      .getByRole('menuitem')
      .filter({ hasText: /^Group/ })
      .click();
    await expect(groups).toHaveCount(count);
    const ids = await groups.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-plan-node')!),
    );

    groupIds.push(ids.find((id) => !groupIds.includes(id))!);
  }

  await expect(groups).toHaveCount(2);
  await expect(canvas.locator('[data-ui~="step-insert-trigger"]')).toHaveCount(3);
  await canvas.screenshot({ path: testInfo.outputPath('group-insertions.png') });
  await expect
    .poll(async () => {
      const left = await groups.nth(0).boundingBox();
      const right = await groups.nth(1).boundingBox();

      return (
        !!left &&
        !!right &&
        Math.abs(left.y - right.y) < 2 &&
        (right.x > left.x + left.width || left.x > right.x + right.width)
      );
    })
    .toBe(true);
  const [rightId, leftId] = groupIds;
  const leftGroup = canvas.locator(`[data-plan-node="${leftId}"]`);
  const rightGroup = canvas.locator(`[data-plan-node="${rightId}"]`);
  const rootBounds = (await canvas.locator('[data-plan-node=root]').boundingBox())!;
  const leftBounds = (await leftGroup.boundingBox())!;
  const rightBounds = (await rightGroup.boundingBox())!;

  expect(rootBounds.x + rootBounds.width / 2).toBeCloseTo(
    (Math.min(leftBounds.x, rightBounds.x) +
      Math.max(leftBounds.x + leftBounds.width, rightBounds.x + rightBounds.width)) /
      2,
    0,
  );

  for (const index of [0, 1])
    await expect(
      canvas.locator(`[data-testid="rf__edge-containment:root:${index}:plan:root"]`),
    ).toHaveCount(1);

  await leftGroup.hover();
  await leftGroup.getByRole('button', { name: `复制节点 ${leftId}`, exact: true }).click();
  await expect(groups).toHaveCount(3);
  await expect(canvas.locator('[data-ui~="step-insert-trigger"]')).toHaveCount(4);
  const copy = groups.locator(
    `:scope:not([data-plan-node="${leftId}"]):not([data-plan-node="${rightId}"])`,
  );
  const copyId = (await copy.getAttribute('data-plan-node'))!;

  await copy.hover();
  await copy.getByRole('button', { name: `删除节点 ${copyId}`, exact: true }).click();
  await expect(groups).toHaveCount(2);
  await expect(canvas.locator('[data-ui~="step-insert-trigger"]')).toHaveCount(3);

  for (const id of [leftId, rightId]) {
    await canvas
      .getByRole('button', { name: `在 ${id} 的第 1 个位置添加节点`, exact: true })
      .click();
    await page.getByRole('menuitem').filter({ hasText: /^Act/ }).click();
  }

  const tasks = canvas.locator('[data-step-type=act]');

  await expect(tasks).toHaveCount(2);
  await expect
    .poll(async () => {
      const left = await tasks.nth(0).boundingBox();
      const right = await tasks.nth(1).boundingBox();

      return (
        !!left &&
        !!right &&
        Math.abs(left.y - right.y) < 2 &&
        (right.x > left.x + left.width || left.x > right.x + right.width)
      );
    })
    .toBe(true);
  // Inserting a task between the groups places the second group below the first.
  await canvas.getByRole('button', { name: '在 root 的第 1 个位置添加节点', exact: true }).click();
  await page.getByRole('combobox', { name: '插入位置', exact: true }).selectOption('1');
  await page
    .getByRole('menuitem')
    .filter({ hasText: /^Assert/ })
    .click();
  await expect
    .poll(async () => {
      const left = await leftGroup.boundingBox();
      const right = await rightGroup.boundingBox();

      return !!left && !!right && right.y > left.y + left.height;
    })
    .toBe(true);
  expect(errors).toEqual([]);
});

test('left mouse selects nodes and middle mouse pans the board', async ({ page }) => {
  const task = (id: string) => ({
    id,
    kind: 'task' as const,
    goal: id,
    dependsOn: [],
    requirementIds: [],
    assertions: [],
  });
  const plan: NonNullable<TestRun['plan']> = {
    rootId: 'root',
    nodes: {
      root: { id: 'root', kind: 'group', goal: '选择测试', children: ['a', 'b'], dependsOn: [] },
      a: task('a'),
      b: task('b'),
    },
  };

  await mockRun(page, makeRun({ plan }));
  await page.goto(`/runs/${run.id}`);
  await page.getByRole('button', { name: '计划', exact: true }).click();
  const board = page.locator('[data-ui~="plan-viewport"]');
  const flowViewport = board.locator('.react-flow__viewport');
  const a = board.locator('[data-testid="rf__node-plan:a"]');
  const b = board.locator('[data-testid="rf__node-plan:b"]');

  await a.locator('[data-ui~="step-badge"]').click();
  await expect(a).toHaveClass(/selected/);
  const bounds = (await board.boundingBox())!;
  const transform = await flowViewport.getAttribute('style');

  await page.mouse.move(bounds.x + 20, bounds.y + 20);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(bounds.x + 90, bounds.y + 70, { steps: 5 });
  await page.mouse.up({ button: 'left' });
  expect(await flowViewport.getAttribute('style')).toBe(transform);

  await page.mouse.move(bounds.x + 20, bounds.y + 20);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(bounds.x + 90, bounds.y + 70, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  await expect.poll(() => flowViewport.getAttribute('style')).not.toBe(transform);

  const badge = (await a.locator('[data-ui~="step-badge"]').boundingBox())!;
  const panned = await flowViewport.getAttribute('style');

  await page.mouse.move(badge.x + badge.width / 2, badge.y + badge.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(badge.x + badge.width / 2 - 30, badge.y + badge.height / 2, { steps: 5 });
  await page.mouse.up({ button: 'middle' });
  await expect.poll(() => flowViewport.getAttribute('style')).not.toBe(panned);

  const selectTool = board.getByRole('button', { name: '选择节点', exact: true });
  const panTool = board.getByRole('button', { name: '平移画板', exact: true });

  await expect(selectTool).toHaveAttribute('aria-pressed', 'true');
  await panTool.click();
  await expect(panTool).toHaveAttribute('aria-pressed', 'true');
  await expect(selectTool).toHaveAttribute('aria-pressed', 'false');
  const beforePanTool = await flowViewport.getAttribute('style');

  await page.mouse.move(bounds.x + 20, bounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 60, bounds.y + 60, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => flowViewport.getAttribute('style')).not.toBe(beforePanTool);
  await expect(board.locator('.react-flow__selection')).toHaveCount(0);
  await selectTool.click();
  await expect(selectTool).toHaveAttribute('aria-pressed', 'true');

  const beforeSpace = await flowViewport.getAttribute('style');

  await board.focus();
  await page.keyboard.down('Space');
  await page.mouse.move(bounds.x + 20, bounds.y + 20);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(bounds.x + 60, bounds.y + 60, { steps: 5 });
  await page.mouse.up({ button: 'left' });
  await page.keyboard.up('Space');
  await expect.poll(() => flowViewport.getAttribute('style')).not.toBe(beforeSpace);

  await page.getByRole('button', { name: '全览画板', exact: true }).click();
  await expect.poll(() => flowViewport.getAttribute('style')).toBe(transform);
  const aBounds = (await a.boundingBox())!;
  const bBounds = (await b.boundingBox())!;

  await page.mouse.move(aBounds.x - 10, aBounds.y - 10);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(bBounds.x + bBounds.width + 10, bBounds.y + bBounds.height + 10, {
    steps: 8,
  });
  await page.mouse.up({ button: 'left' });
  await expect(a).toHaveClass(/selected/);
  await expect(b).toHaveClass(/selected/);
});

test('result board shows assertion evidence and links screenshots to the existing timeline', async ({
  page,
}) => {
  const screenshotStep = makeStep(run, {
    id: 'capture-step',
    planNodeId: 'capture',
    title: '保存订单截图',
    startedAt: '2026-10-01T00:00:01Z',
    finishedAt: '2026-10-01T00:00:02Z',
    durationMs: 1000,
  });
  const assertionStep = makeStep(run, {
    ...screenshotStep,
    id: 'assert-step',
    planNodeId: 'check',
    sequence: 2,
    title: '订单金额为 100',
    kind: 'assertion',
    status: 'failed',
    startedAt: '2026-10-01T00:00:03Z',
    finishedAt: '2026-10-01T00:00:04Z',
    assertion: { description: '订单金额为 100' },
    evidence: '页面显示金额 120',
    error: '金额不符合预期',
  });
  const plan: NonNullable<TestRun['plan']> = {
    rootId: 'root',
    nodes: {
      root: {
        id: 'root',
        kind: 'group',
        presentation: 'sequence',
        goal: '验证订单',
        children: ['capture', 'check'],
        dependsOn: [],
      },
      capture: {
        id: 'capture',
        kind: 'task',
        actionType: 'screenshot',
        goal: '保存订单截图',
        dependsOn: [],
        requirementIds: [],
        assertions: [],
      },
      check: {
        id: 'check',
        kind: 'task',
        actionType: 'assert',
        goal: '订单金额为 100',
        dependsOn: [],
        requirementIds: [],
        assertions: [{ description: '订单金额为 100' }],
      },
    },
  };
  const artifacts = [screenshotStep, assertionStep].map((step, index) =>
    makeScreenshot(run, {
      id: `board-frame-${index}`,
      stepId: step.id,
      capturedAt: step.finishedAt,
      elapsedMs: (index + 1) * 2000,
    }),
  );

  await mockRun(
    page,
    makeRun({
      status: 'failed',
      durationMs: 5000,
      plan,
      steps: [screenshotStep, assertionStep],
      artifacts,
    }),
  );
  await mockScreenshots(page, run.id);
  await page.goto(`/runs/${run.id}`);
  await page.getByRole('button', { name: '计划', exact: true }).click();
  const assertion = page.locator('[data-plan-node="check"]');
  const capture = page.locator('[data-plan-node="capture"]');

  await expect(assertion).toHaveAttribute('data-result', 'failed');
  await expect(assertion.getByText('验证证据：页面显示金额 120')).toBeVisible();
  await expect(assertion.getByText('金额不符合预期')).toBeVisible();
  await expect(capture.getByRole('img', { name: '证据截图：保存订单截图' })).toBeVisible();
  await capture.getByRole('button', { name: '查看截图：保存订单截图', exact: true }).click();
  await expect(page.getByRole('img', { name: /^执行画面/ })).toHaveAttribute(
    'src',
    /board-frame-0$/,
  );
  await expect(page.getByLabel('回放时间', { exact: true })).toHaveText('00:02 / 00:05');
  await expect(capture).toHaveAttribute('data-current', 'true');
  await page.getByRole('button', { name: '播放回看', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停回看', exact: true })).toBeVisible();
  await expect(page.getByLabel('回放时间', { exact: true })).toHaveText('00:03 / 00:05');
  await page.getByRole('button', { name: '暂停回看', exact: true }).click();
  await page.getByRole('slider', { name: '画面时间轴' }).fill('3500');
  await expect(assertion).toHaveAttribute('data-current', 'true');
  await expect(assertion).toHaveAttribute('data-result', 'failed');
  await page.getByRole('slider', { name: '画面时间轴' }).fill('1000');
  await expect(capture).toHaveAttribute('data-current', 'true');
  await expect(assertion).toHaveAttribute('data-result', 'failed');
  await assertion.getByRole('button', { name: '展开动作', exact: true }).click();
  await assertion.locator('[data-ui="plan-inline-evidence"]').getByRole('button').first().click();
  await expect(page.getByRole('img', { name: /^执行画面/ })).toHaveAttribute(
    'src',
    /board-frame-1$/,
  );
});
