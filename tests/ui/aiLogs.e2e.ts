import { test, expect } from './fixtures/test.fixture';
import { makeRun, makeStep } from './fixtures/workspace';
import { mockRun, mockWorkspaceSupport } from './fixtures/routes';

const run = makeRun({
  events: [{ at: '2026-10-14T00:13:03Z', message: '执行任务：在搜索框中输入 vscode 并执行搜索' }],
});

test('AI logs show calls directly without repeating execution steps', async ({
  page,
  runPage,
}, testInfo) => {
  await mockWorkspaceSupport(page);
  await mockRun(page, run);
  await page.route('**/model-usage', (route) =>
    route.fulfill({
      json: {
        usage: {
          calls: 3,
          failures: 1,
          retries: 1,
          durationMs: 4300,
          inputTokens: 1200,
          outputTokens: 340,
          unknownUsage: 1,
        },
        calls: [
          {
            id: 'first',
            model: 'deepseek-flash',
            purpose: 'plan',
            startedAt: '2026-10-14T00:13:03Z',
            durationMs: 3100,
            status: 'passed',
            retryCount: 0,
            failedAttempts: 0,
            inputTokens: 1200,
            outputTokens: 340,
          },
          {
            id: 'second',
            model: 'deepseek-flash',
            startedAt: '2026-10-14T00:13:13Z',
            durationMs: 1200,
            status: 'timeout',
            retryCount: 1,
            failedAttempts: 1,
            inputTokens: null,
            outputTokens: null,
            errorCode: 'TimeoutError',
          },
        ],
      },
    }),
  );
  await runPage.goto(run.id);
  await expect(page.getByRole('button', { name: '执行日志', exact: true })).toHaveCount(0);
  await runPage.openAiLogs();
  const panel = runPage.aiContent;
  const calls = panel.getByRole('listitem');

  await expect(panel.locator('details')).toHaveCount(0);

  await expect(calls).toHaveCount(2);
  await expect(panel).not.toContainText('执行任务：');
  await expect(panel.getByLabel('输入 1200 tokens')).toBeVisible();
  await expect(panel.getByLabel('输出 340 tokens')).toBeVisible();
  await expect(calls.first()).toContainText('完成');
  await expect(calls.last()).toContainText('超时');
  await expect(calls.last()).toContainText('重试 1');
  await panel.getByRole('searchbox', { name: '搜索 AI 调用' }).fill('生成计划');
  await expect(calls).toHaveCount(1);
  await expect(calls.first()).toContainText('生成计划');
  await panel.getByRole('searchbox', { name: '搜索 AI 调用' }).fill('超时');
  await expect(calls).toHaveCount(1);
  await panel.getByRole('searchbox', { name: '搜索 AI 调用' }).fill('');
  await expect(calls).toHaveCount(2);
  const listBounds = await calls.first().boundingBox();

  await panel.getByRole('button', { name: '查看调用 2：deepseek-flash' }).click();
  const drawer = panel.getByRole('complementary');

  await expect(drawer).toHaveAccessibleName('第 2 次调用');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await calls.first().boundingBox()).toEqual(listBounds);
  await expect(calls.first()).toBeVisible();
  await expect(drawer.getByText('TimeoutError', { exact: true })).toBeVisible();
  await expect(drawer.getByText('失败尝试 1', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: '下一条' })).toBeDisabled();
  await calls
    .first()
    .getByRole('button')
    .click({ position: { x: 20, y: 12 } });
  await expect(drawer).toHaveAccessibleName('第 1 次调用');
  await expect(drawer.getByRole('button', { name: '上一条' })).toBeDisabled();
  await drawer.getByRole('button', { name: '下一条' }).click();
  await expect(drawer).toHaveAccessibleName('第 2 次调用');
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(calls.first().getByRole('button')).toBeFocused();
  await calls
    .first()
    .getByRole('button')
    .click({ position: { x: 20, y: 12 } });
  await expect(drawer).toHaveAccessibleName('第 1 次调用');
  await drawer.getByRole('button', { name: '关闭调用详情' }).click();
  await expect(calls.first().getByRole('button')).toBeFocused();
  await calls
    .first()
    .getByRole('button')
    .click({ position: { x: 20, y: 12 } });
  await panel.getByRole('searchbox', { name: '搜索 AI 调用' }).fill('超时');
  await expect(drawer).toHaveCount(0);
  await expect(calls).toHaveCount(1);
  await panel.getByRole('searchbox', { name: '搜索 AI 调用' }).fill('');
  await panel.screenshot({ path: testInfo.outputPath('ai-logs.png') });
});

test('AI log updates follow the bottom and preserve historical scroll positions', async ({
  page,
  runPage,
}) => {
  await page.clock.install();
  await mockWorkspaceSupport(page);
  await mockRun(page, makeRun({ ...run, status: 'running', finishedAt: undefined }));
  await page.route('**/api/runs/*/events?*', (route) => route.fulfill({ status: 503 }));
  let count = 30;

  await page.route('**/model-usage', (route) =>
    route.fulfill({
      json: {
        usage: {
          calls: count,
          failures: 0,
          retries: 0,
          durationMs: count * 100,
          inputTokens: count * 10,
          outputTokens: count,
          unknownUsage: 0,
        },
        calls: Array.from({ length: count }, (_, index) => ({
          id: `call-${index}`,
          model: 'deepseek-flash',
          startedAt: new Date(Date.parse(run.startedAt) + index * 1000).toISOString(),
          durationMs: 100,
          status: 'passed',
          retryCount: 0,
          failedAttempts: 0,
          inputTokens: 10,
          outputTokens: 1,
        })),
      },
    }),
  );
  await runPage.goto(run.id);
  await runPage.openAiLogs();
  const panel = page.getByRole('region', { name: 'AI 调用记录' });
  const scroll = panel.locator('ol').locator('..');

  await page.clock.runFor(100);
  await expect(panel.getByRole('listitem')).toHaveCount(30);
  await expect
    .poll(async () => {
      await page.clock.runFor(50);

      return scroll.evaluate(
        (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
      );
    })
    .toBeLessThanOrEqual(24);
  await scroll.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  count = 32;
  await page.clock.runFor(5500);
  await expect(panel.getByRole('listitem')).toHaveCount(32);
  expect(await scroll.evaluate((element) => element.scrollTop)).toBe(0);
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event('scroll'));
  });
  count = 34;
  await page.clock.runFor(5500);
  await expect(panel.getByRole('listitem')).toHaveCount(34);
  await expect
    .poll(async () => {
      await page.clock.runFor(50);

      return scroll.evaluate(
        (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
      );
    })
    .toBeLessThanOrEqual(24);
});

test('AI trajectories load lazily and connect replies and tool results to execution steps', async ({
  page,
  workspacePage,
  runPage,
}, testInfo) => {
  await mockWorkspaceSupport(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const callId = '76f66d86-08b8-43f5-8209-678c1f248f0c';
  const fill = makeStep(run, {
    id: 'fill-result',
    sequence: 2,
    kind: 'action',
    title: '输入搜索内容',
    modelCallId: callId,
    toolCallId: 'fill-1',
    action: {
      platform: 'web',
      action: {
        type: 'fill',
        target: { kind: 'testId', value: 'search', name: 'Search' },
        value: 'modern ui',
      },
    },
    durationMs: 25,
  });
  const click = makeStep(run, {
    id: 'click-result',
    sequence: 3,
    kind: 'action',
    title: '提交搜索',
    modelCallId: callId,
    toolCallId: 'click-1',
    status: 'failed',
    error: 'Search button disappeared',
    durationMs: 40,
  });

  await mockRun(page, makeRun({ ...run, steps: [...run.steps, fill, click] }));
  await page.route('**/model-usage', (route) =>
    route.fulfill({
      json: {
        usage: {
          calls: 1,
          failures: 0,
          retries: 0,
          durationMs: 1200,
          inputTokens: 500,
          outputTokens: 80,
          unknownUsage: 0,
        },
        calls: [
          {
            id: callId,
            model: 'deepseek-flash',
            startedAt: run.startedAt,
            durationMs: 1200,
            status: 'passed',
            retryCount: 0,
            failedAttempts: 0,
            inputTokens: 500,
            outputTokens: 80,
            hasTrace: true,
            purpose: 'plan',
            preview: 'Search for modern ui <script>',
          },
        ],
      },
    }),
  );
  let reads = 0;

  await page.route(`**/model-usage/${callId}`, (route) => {
    reads++;

    return route.fulfill({
      json: {
        trace: {
          input: [
            { role: 'system', content: 'Follow the test plan\n'.repeat(80) },
            { role: 'user', content: 'Search for modern ui <script>\n[图片：image/png]' },
            { role: 'assistant', content: 'Previous tool request' },
          ],
          reply: 'Search for modern ui <script>\n'.repeat(80),
          tools: [
            { id: 'fill-1', name: 'fill', arguments: '{"ref":"e1","value":"modern ui"}' },
            { id: 'click-1', name: 'click', arguments: '{"ref":"e2"}' },
            { id: 'skipped-1', name: 'press', arguments: '{invalid' },
          ],
        },
        steps: [fill, click],
      },
    });
  });
  await runPage.goto(run.id);
  await runPage.openAiLogs();
  const panel = runPage.aiContent;

  await expect(panel.getByRole('listitem')).toHaveCount(1);
  await expect(panel.locator('details')).toHaveCount(0);
  expect(reads).toBe(0);
  await panel.getByRole('button', { name: '第 1 次调用：deepseek-flash' }).click();
  const drawer = panel.getByRole('complementary');

  await expect(drawer.getByRole('region', { name: '模型回复' })).toContainText(
    'modern ui <script>',
  );
  const input = drawer.getByRole('region', { name: '模型输入', exact: true });

  await expect(drawer.locator('details')).toHaveCount(0);
  await expect(input.getByRole('heading').nth(0)).toContainText('系统');
  await expect(input.getByRole('heading').nth(1)).toContainText('用户');
  await expect(input.locator('pre').nth(1)).toContainText('modern ui <script>');
  await expect(input.locator('pre').nth(1)).toContainText('[图片：image/png]');
  const longInput = input.locator('pre').first();
  const reply = drawer.getByRole('region', { name: '模型回复' }).locator('pre');

  for (const block of [longInput, reply]) {
    const scroll = await block.evaluate((element) => ({
      height: element.clientHeight,
      contentHeight: element.scrollHeight,
    }));

    expect(scroll.height).toBeLessThanOrEqual(180);
    expect(scroll.contentHeight).toBeGreaterThan(scroll.height);
  }

  const nextInputBounds = await input.locator('pre').nth(1).boundingBox();

  await longInput.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await longInput.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await input.locator('pre').nth(1).boundingBox()).toEqual(nextInputBounds);
  const tools = drawer.getByRole('list', { name: '工具调用' }).getByRole('listitem');

  await expect(tools).toHaveCount(3);
  await expect(tools.nth(0)).toContainText('modern ui');
  await expect(tools.nth(0)).toContainText('完成');
  await expect(tools.nth(1)).toContainText('Search button disappeared');
  await expect(tools.nth(2)).toContainText('未执行');
  await expect(tools.nth(2)).toContainText('{invalid');
  const copies = [
    {
      button: drawer.getByRole('button', { name: '复制系统输入', exact: true }),
      value: 'Follow the test plan\n'.repeat(80),
    },
    {
      button: drawer.getByRole('button', { name: '复制用户输入', exact: true }),
      value: 'Search for modern ui <script>\n[图片：image/png]',
    },
    {
      button: drawer.getByRole('button', { name: '复制助手输入', exact: true }),
      value: 'Previous tool request',
    },
    {
      button: drawer.getByRole('button', { name: '复制模型回复', exact: true }),
      value: 'Search for modern ui <script>\n'.repeat(80),
    },
    {
      button: tools.first().getByRole('button', { name: '复制 fill 参数', exact: true }),
      value: JSON.stringify({ ref: 'e1', value: 'modern ui' }, null, 2),
    },
    {
      button: tools.nth(1).getByRole('button', { name: '复制错误信息', exact: true }),
      value: 'Search button disappeared',
    },
    {
      button: tools.nth(1).getByRole('button', { name: '复制执行结果', exact: true }),
      value: '提交搜索\n失败\n40 ms\nSearch button disappeared',
    },
  ];

  for (const { button, value } of copies) {
    await button.click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(value);
    await expect(
      workspacePage.notifications.getByText('已复制', { exact: true }).first(),
    ).toBeVisible();
  }

  expect(reads).toBe(1);
  await expect(drawer.getByRole('region', { name: '模型回复' })).toBeVisible();
  const desktopDrawer = await drawer.boundingBox();
  const desktopPanel = await panel.boundingBox();

  expect(desktopDrawer!.x).toBeGreaterThan(desktopPanel!.x);
  expect(desktopDrawer!.width).toBeLessThan(desktopPanel!.width);
  const listArea = await drawer.locator('..').boundingBox();

  expect(desktopDrawer!.y).toBe(listArea!.y);
  expect(desktopDrawer!.height).toBe(listArea!.height);
  expect(desktopDrawer!.width).toBeCloseTo(Math.min(listArea!.width * 0.55, 640), 0);
  await page.screenshot({ path: testInfo.outputPath('ai-trajectory.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(drawer.getByRole('button', { name: '关闭调用详情' })).toBeVisible();
  await expect
    .poll(() =>
      drawer.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const parent = element.parentElement!.getBoundingClientRect();

        return { y: bounds.y - parent.y, height: bounds.height - parent.height };
      }),
    )
    .toEqual({ y: 0, height: 0 });
  expect(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const bounds = await drawer.boundingBox();

  const panelBounds = await panel.boundingBox();

  expect(bounds!.x).toBeGreaterThanOrEqual(panelBounds!.x);
  expect(bounds!.width).toBeLessThanOrEqual(panelBounds!.width);
  expect(bounds!.y).toBeGreaterThan(panelBounds!.y);
  const mobileListArea = await drawer.locator('..').boundingBox();

  expect(bounds!.y).toBe(mobileListArea!.y);
  expect(bounds!.height).toBe(mobileListArea!.height);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(panelBounds!.y + panelBounds!.height + 1);
  await drawer.screenshot({ path: testInfo.outputPath('ai-trajectory-mobile.png') });
  await tools.first().getByRole('button', { name: '查看步骤', exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(
    runPage.steps.getByRole('heading', { name: '输入搜索内容', exact: true }),
  ).toBeVisible();
});

test('run panels refresh from the shared stream and poll only after disconnect', async ({
  page,
  runPage,
}) => {
  const activeRun = makeRun({ status: 'running', finishedAt: undefined, realtimeRevision: 1 });
  let modelReads = 0;
  let issueReads = 0;

  await page.clock.install();
  await mockWorkspaceSupport(page);
  await mockRun(page, activeRun);
  await page.route('**/model-usage', (route) => {
    modelReads++;

    return route.fulfill({
      json: {
        usage: {
          calls: 0,
          failures: 0,
          retries: 0,
          durationMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          unknownUsage: 0,
        },
        calls: [],
      },
    });
  });
  await page.route('**/api/issues?*', (route) => {
    issueReads++;

    return route.fulfill({ json: { issues: [], nextCursor: null } });
  });
  await page.addInitScript((snapshot) => {
    const streams: EventTarget[] = [];

    Object.assign(window, { __panelStreams: streams });
    class FakeEventSource extends EventTarget {
      onerror: (() => void) | null = null;
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
  await runPage.goto(activeRun.id);
  await runPage.openAiLogs();
  await expect.poll(() => modelReads).toBeGreaterThan(0);
  await expect.poll(() => issueReads).toBeGreaterThan(0);
  await page.clock.fastForward(11000);
  const before = { modelReads, issueReads };

  await page.clock.fastForward(11000);
  expect(modelReads).toBe(before.modelReads);
  expect(issueReads).toBe(before.issueReads);
  await page.evaluate(() => {
    const stream = (window as unknown as { __panelStreams: EventTarget[] }).__panelStreams[0];

    stream.dispatchEvent(
      new MessageEvent('updates', { data: JSON.stringify([{ kind: 'model', revision: 2 }]) }),
    );
  });
  await expect.poll(() => modelReads).toBeGreaterThan(before.modelReads);
  expect(issueReads).toBe(before.issueReads);
  await page.evaluate(() => {
    const stream = (window as unknown as { __panelStreams: EventTarget[] }).__panelStreams[0];

    stream.dispatchEvent(new MessageEvent('changed', { data: '{}' }));
  });
  await expect.poll(() => issueReads).toBeGreaterThan(before.issueReads);
  const after = modelReads;

  await page.evaluate(() => {
    const stream = (window as unknown as { __panelStreams: { onerror: () => void }[] })
      .__panelStreams[0];

    stream.onerror();
  });
  await page.clock.fastForward(6000);
  await expect.poll(() => modelReads).toBeGreaterThan(after);
});
