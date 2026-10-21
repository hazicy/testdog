import { WebTargetSchema } from '@testdog/contracts/execution/target';
import { test, expect } from './fixtures/test.fixture';
import type { Issue, IssueDetail, IssueOccurrence } from '@testdog/contracts/issues/types';
import type { TestRun } from '@testdog/contracts/runs/types';

const issueId = '62534c46-a8eb-4991-993e-af6df14bece0';
const runId = '62534c46-a8eb-4991-993e-af6df14bece1';
const stepId = '62534c46-a8eb-4991-993e-af6df14bece2';
const occurrenceId = '62534c46-a8eb-4991-993e-af6df14bece3';
const timestamp = '2026-10-01T00:00:00Z';
const initial: Issue = {
  id: issueId,
  title: '订单金额错误',
  status: 'open',
  severity: 'high',
  closeReason: null,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const run: TestRun = {
  id: runId,
  targetSnapshot: WebTargetSchema.parse({
    platform: 'web',
    url: 'https://example.com',
    deviceProfile: 'legacy-desktop',
  }),
  name: '验证订单',
  goal: '订单金额为100',
  url: 'https://example.com',
  status: 'failed',
  mode: 'record',
  startedAt: timestamp,
  durationMs: 1000,
  replayable: false,
  cancelRequested: false,
  events: [],
  artifacts: [],
  plan: {
    rootId: 'amount',
    nodes: {
      amount: {
        id: 'amount',
        kind: 'task',
        actionType: 'assert',
        goal: '订单金额为100',
        assertions: [{ description: '订单金额为100' }],
        dependsOn: [],
        requirementIds: [],
      },
    },
  },
  steps: [
    {
      id: stepId,
      runId,
      sequence: 1,
      kind: 'assertion',
      title: '订单金额为100',
      planNodeId: 'amount',
      assertion: { description: '订单金额为100' },
      status: 'failed',
      startedAt: timestamp,
      durationMs: 1000,
      pageId: 'page',
      pageUrl: 'https://example.com',
      error: '实际为120',
      replayable: false,
    },
  ],
};
const occurrence: IssueOccurrence = {
  id: occurrenceId,
  issueId,
  runId,
  stepId,
  createdAt: timestamp,
  snapshot: {
    name: run.name,
    goal: run.goal,
    url: run.url,
    testId: issueId,
    step: run.steps[0],
    artifacts: [],
    error: '实际为120',
  },
};

test('creates, edits, closes and reopens an issue without activity or comments', async ({
  page,
  issuesPage,
}) => {
  let issue = { ...initial };
  const detail: IssueDetail = { issue, occurrences: [], verifications: [] };

  await page.route('**/api/issues{,?*}', async (route) => {
    if (route.request().method() === 'POST') {
      issue = { ...issue, ...route.request().postDataJSON() };
      detail.issue = issue;

      return route.fulfill({ json: { issue } });
    }

    return route.fulfill({ json: { issues: [], nextCursor: null } });
  });
  await page.route(`**/api/issues/${issueId}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const { version, ...patch } = route.request().postDataJSON();

      issue = {
        ...issue,
        ...patch,
        version: version + 1,
        closeReason: patch.status === 'open' ? null : (patch.closeReason ?? issue.closeReason),
      };
      detail.issue = issue;
    }

    return route.fulfill({ json: route.request().method() === 'PATCH' ? { issue } : detail });
  });
  await issuesPage.goto();
  await expect(page.getByText('暂无问题', { exact: true })).toBeVisible();
  await issuesPage.createButton.click();
  await issuesPage.titleInput.fill('订单金额错误');
  await expect(page.getByLabel('问题描述', { exact: true })).toHaveCount(0);
  await issuesPage.saveButton.click();
  await expect(page).toHaveURL(`/issues/${issueId}`);
  await expect(page.getByRole('heading', { level: 1, name: /^订单金额错误/ })).toBeVisible();
  await expect(page.getByText('动态', { exact: true })).toHaveCount(0);
  await expect(page.getByText('添加说明', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('补充处理说明')).toHaveCount(0);
  await issuesPage.openEditor();
  await issuesPage.statusSelect.click();
  await page.getByRole('option', { name: '已关闭', exact: true }).click();
  await issuesPage.saveButton.click();
  await expect(page.getByText('关闭原因：已修复')).toBeVisible();
  await issuesPage.openEditor();
  await issuesPage.statusSelect.click();
  await page.getByRole('option', { name: '待确认', exact: true }).click();
  await issuesPage.saveButton.click();
  await expect(page.getByText('关闭原因：已修复')).toHaveCount(0);
});

test('issue editor fits a narrow phone with severity selection', async ({ page, issuesPage }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await page.route('**/api/issues*', (route) =>
    route.fulfill({ json: { issues: [], nextCursor: null } }),
  );
  await issuesPage.goto();
  await issuesPage.createButton.click();
  const dialog = page.getByRole('dialog');

  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(dialog.getByRole('combobox')).toHaveCount(1);
  await expect(dialog.getByRole('combobox', { name: '严重程度', exact: true })).toBeVisible();
  await dialog.getByLabel('问题标题', { exact: true }).fill('手机端问题');
  await dialog.getByRole('button', { name: '保存问题', exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: '保存问题', exact: true })).toBeInViewport();
});

test('creates an issue from a failed board node and starts a regression without auto-closing', async ({
  page,
  runPage,
  issuesPage,
}) => {
  const detail: IssueDetail = {
    issue: initial,
    occurrences: [occurrence],
    verifications: [],
  };
  let submittedSource: unknown;

  await page.route(`**/api/runs/${runId}{,?*}`, (route) => route.fulfill({ json: { run } }));
  await page.route('**/api/issues', (route) => {
    submittedSource = route.request().postDataJSON().source;

    return route.fulfill({ json: { issue: initial } });
  });
  await page.route(`**/api/issues/${issueId}`, (route) => route.fulfill({ json: detail }));
  await page.route(`**/api/issues/${issueId}/verifications`, (route) => {
    expect(route.request().postDataJSON()).toEqual({ occurrenceId });
    detail.issue = { ...initial, status: 'pending_verification' };
    detail.verifications.push({
      id: 'verification',
      issueId,
      occurrenceId,
      runId,
      createdAt: timestamp,
      runStatus: 'passed',
      outcome: 'passed',
      explanation: '目标执行通过。',
    });

    return route.fulfill({ json: { run } });
  });
  await runPage.goto(runId);
  await runPage.planButton.click();
  await page
    .locator('[data-plan-node="amount"]')
    .getByRole('button', { name: '创建或关联问题' })
    .click();
  await expect(issuesPage.titleInput).toHaveValue('实际为120');
  await expect(page.getByLabel('问题描述', { exact: true })).toHaveCount(0);
  await issuesPage.saveButton.click();
  await expect(page).toHaveURL(`/issues/${issueId}`);
  expect(submittedSource).toEqual({ runId, stepId });
  await expect(page.getByRole('region', { name: '最近出现' }).getByText('实际为120')).toBeVisible();
  await page.getByRole('button', { name: '回归验证', exact: true }).click();
  await page.getByRole('button', { name: '发起回归验证' }).click();
  await expect(
    page.getByRole('region', { name: '回归验证' }).getByText('目标验证通过'),
  ).toBeVisible();
  await expect(page.getByText('待验证', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '查看回归执行' })).toHaveAttribute(
    'href',
    `/runs/${runId}`,
  );
});

test('links a failed step to an existing issue and filters the issue list', async ({
  page,
  runPage,
}) => {
  let linked = false;
  const queries: string[] = [];

  await page.route(`**/api/runs/${runId}{,?*}`, (route) => route.fulfill({ json: { run } }));
  await page.route('**/api/issues?*', (route) => {
    queries.push(route.request().url());

    return route.fulfill({ json: { issues: [initial], nextCursor: null } });
  });
  await page.route(`**/api/issues/${issueId}/occurrences`, (route) => {
    expect(route.request().postDataJSON()).toEqual({ runId, stepId });
    linked = true;

    return route.fulfill({ json: { linked: true } });
  });
  await page.route(`**/api/issues/${issueId}`, (route) =>
    route.fulfill({
      json: { issue: initial, occurrences: [occurrence], verifications: [] },
    }),
  );
  await runPage.goto(runId);
  await runPage.planButton.click();
  await page
    .locator('[data-plan-node="amount"]')
    .getByRole('button', { name: '创建或关联问题' })
    .click();
  await page.getByRole('button', { name: '关联已有问题', exact: true }).click();
  await page.getByRole('combobox', { name: '选择已有问题' }).click();
  await page.getByRole('option', { name: '待确认 · 订单金额错误' }).click();
  await page.getByRole('button', { name: '关联问题', exact: true }).click();
  await expect(page).toHaveURL(`/issues/${issueId}`);
  expect(linked).toBe(true);
  await page.getByRole('link', { name: '返回问题追踪', exact: true }).click();
  await page.getByRole('combobox', { name: '筛选问题状态' }).click();
  await page.getByRole('option', { name: '处理中', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索问题', exact: true }).fill('订单');
  await expect
    .poll(() =>
      queries.some(
        (url) =>
          new URL(url).searchParams.get('q') === '订单' &&
          new URL(url).searchParams.get('status') === 'in_progress',
      ),
    )
    .toBe(true);
});

test('shows issue summaries and filters environment, date and ordering', async ({
  page,
}, testInfo) => {
  const queries: URL[] = [];

  await page.route('**/api/issues?*', (route) => {
    queries.push(new URL(route.request().url()));

    return route.fulfill({
      json: {
        issues: [
          {
            ...initial,
            runCount: 2,
            lastSeen: new Date().toISOString(),
            latestOccurrence: occurrence,
          },
          {
            ...initial,
            id: '62534c46-a8eb-4991-993e-af6df14bece7',
            title: 'click · div >> internal:has-text=/^Explore$/ >> nth=0',
            severity: 'medium',
            runCount: 1,
            latestOccurrence: occurrence,
          },
        ],
        nextCursor: null,
      },
    });
  });
  await page.goto('/issues');
  await expect(page.getByRole('link', { name: '订单金额错误', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2', exact: true })).toBeVisible();
  const severityWidth = (await page
    .getByRole('columnheader', { name: '严重程度', exact: true })
    .boundingBox())!.width;
  const titleWidth = (await page
    .getByRole('columnheader', { name: '问题', exact: true })
    .boundingBox())!.width;
  const rootFontSize = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).fontSize),
  );

  expect(severityWidth).toBeLessThanOrEqual(6 * rootFontSize + 1);
  expect(titleWidth).toBeGreaterThan(severityWidth * 2);
  await page.getByRole('link', { name: '订单金额错误', exact: true }).hover();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('订单金额错误', { exact: true })).toBeVisible();
  await page.getByRole('columnheader', { name: '严重程度' }).hover();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('issue-list.png'), fullPage: true });
  const selectAll = page.getByRole('checkbox', { name: '全选问题', exact: true });
  const selectFirst = page.getByRole('checkbox', { name: '选择问题：订单金额错误', exact: true });

  const header = page.locator('thead');
  const headerHeight = (await header.boundingBox())!.height;
  const expectStableHeader = async () => {
    expect((await header.boundingBox())!.height).toBeCloseTo(headerHeight, 1);
  };

  await selectFirst.check();
  await expect(selectAll).toHaveAttribute('aria-checked', 'mixed');
  await expectStableHeader();
  await selectAll.check();
  await expectStableHeader();
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(3);
  await selectAll.uncheck();
  await expectStableHeader();
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await selectFirst.check();
  await page.getByRole('combobox', { name: '筛选环境' }).click();
  await page.getByRole('option', { name: 'Android', exact: true }).click();
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: '筛选日期' }).click();
  await page.getByRole('option', { name: '最近 7 天', exact: true }).click();
  await page.getByRole('combobox', { name: '问题排序' }).click();
  await page.getByRole('option', { name: '最近更新 ↓', exact: true }).click();
  await expect
    .poll(() =>
      queries.some(
        (url) =>
          url.searchParams.get('platform') === 'android' &&
          url.searchParams.get('days') === '7' &&
          url.searchParams.get('sort') === 'updated',
      ),
    )
    .toBe(true);
});

test('resolves, reopens, edits and deletes issues from compact row actions', async ({ page }) => {
  let issue = { ...initial };
  let deleted = false;
  let failUpdate = true;

  await page.route('**/api/issues?*', (route) =>
    route.fulfill({ json: { issues: deleted ? [] : [issue], nextCursor: null } }),
  );
  await page.route(`**/api/issues/${issueId}`, (route) => {
    if (route.request().method() === 'DELETE') {
      deleted = true;

      return route.fulfill({ json: { ok: true } });
    }

    if (failUpdate) {
      failUpdate = false;

      return route.fulfill({ status: 500, json: { message: '更新失败，请重试' } });
    }

    const patch = route.request().postDataJSON();

    expect(patch.version).toBe(issue.version);
    issue = {
      ...issue,
      ...patch,
      version: issue.version + 1,
      closeReason: patch.status === 'open' ? null : (patch.closeReason ?? issue.closeReason),
    };

    return route.fulfill({ json: { issue } });
  });
  await page.goto('/issues');
  await page.getByRole('button', { name: '标记已解决', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '更新失败，请重试' })).toBeVisible();
  await page.getByRole('button', { name: '标记已解决', exact: true }).click();
  await expect(page.getByRole('button', { name: '重新打开', exact: true })).toBeVisible();
  expect(issue.closeReason).toBe('fixed');
  await page.getByRole('button', { name: '重新打开', exact: true }).click();
  await expect(page.getByRole('button', { name: '标记已解决', exact: true })).toBeVisible();
  expect(issue.closeReason).toBeNull();
  await page.getByRole('button', { name: '问题操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '编辑问题', exact: true }).click();
  await page.getByLabel('问题标题', { exact: true }).fill('更新后的金额问题');
  await page.getByRole('button', { name: '保存问题', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('link', { name: '更新后的金额问题', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '问题操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除问题', exact: true }).click();
  const dialog = page.getByRole('dialog');

  await expect(dialog).toContainText('更新后的金额问题');
  expect(deleted).toBe(false);
  await dialog.getByRole('button', { name: '删除问题', exact: true }).click();
  await expect(page.getByText('暂无问题', { exact: true })).toBeVisible();
});

test('shows expected, actual and reproduction, copies the address and resolves the issue', async ({
  page,
  context,
  workspacePage,
}, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1568, height: 864 });
  const detail: IssueDetail = {
    issue: { ...initial },
    occurrences: [
      {
        ...occurrence,
        snapshot: {
          ...occurrence.snapshot,
          reproduction: ['打开订单页', '查看订单', '确认支付金额'],
          durationMs: 32000,
          runStatus: 'failed',
        },
      },
      {
        ...occurrence,
        id: 'older-occurrence',
        runId: '62534c46-a8eb-4991-993e-af6df14bece4',
        createdAt: '2026-09-29T00:00:00Z',
        snapshot: { ...occurrence.snapshot, durationMs: 32000, runStatus: 'failed' },
      },
    ],
    verifications: [],
  };

  await page.route(`**/api/issues/${issueId}`, (route) => {
    if (route.request().method() === 'PATCH') {
      const patch = route.request().postDataJSON();

      detail.issue = {
        ...detail.issue,
        ...patch,
        version: patch.version + 1,
        closeReason:
          patch.status === 'open' ? null : (patch.closeReason ?? detail.issue.closeReason),
      };
    }

    return route.fulfill({
      json: route.request().method() === 'PATCH' ? { issue: detail.issue } : detail,
    });
  });
  await page.goto(`/issues/${issueId}`);
  const latest = page.getByRole('region', { name: '最近出现' });

  await expect(latest.getByText('订单金额为100', { exact: true })).toBeVisible();
  await expect(latest.getByText('实际为120', { exact: true })).toBeVisible();
  await expect(latest.getByText('查看订单', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: '发现记录', exact: true }).getByRole('row'),
  ).toHaveCount(3);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('issue-detail.png'), fullPage: true });
  await page.getByRole('button', { name: '复制地址', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://example.com');
  await workspacePage.notifications.getByText('已复制地址', { exact: true }).hover();
  await workspacePage.notifications.getByRole('button', { name: '关闭通知' }).click();
  await expect(workspacePage.notifications.getByText('已复制地址', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制修复提示词', exact: true })).toHaveCount(0);
  const notifications = workspacePage.notifications;

  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error('Clipboard unavailable');
    };
  });
  await page.getByRole('button', { name: '复制地址', exact: true }).click();
  await expect(notifications.getByText('复制失败，请检查浏览器剪贴板权限。')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://example.com');
  await page.getByRole('button', { name: '标记已解决', exact: true }).click();
  await expect(page.getByText('关闭原因：已修复')).toBeVisible();
  await page.getByRole('button', { name: '重新打开', exact: true }).click();
  await expect(page.getByText('关闭原因：已修复')).toHaveCount(0);
});

test('opens an issue tab from the transcript and synchronizes it with replay', async ({
  page,
  issuesPage,
  runPage,
}, testInfo) => {
  const frame = {
    id: '62534c46-a8eb-4991-993e-af6df14bece9',
    runId,
    stepId,
    kind: 'screenshot' as const,
    stage: 'after' as const,
    pageId: 'page',
    pageUrl: run.url,
    capturedAt: timestamp,
    elapsedMs: 26000,
    contentType: 'image/png',
    size: 68,
  };
  const failedStep = {
    ...run.steps[0],
    startedAt: '2026-10-01T00:00:20Z',
    finishedAt: '2026-10-01T00:00:26Z',
  };
  const currentRun = { ...run, durationMs: 32000, steps: [failedStep], artifacts: [frame] };
  const currentOccurrence = {
    ...occurrence,
    snapshot: {
      ...occurrence.snapshot,
      step: failedStep,
      reproduction: ['打开订单页', '查看订单', '确认支付金额'],
      artifacts: [frame],
    },
  };
  const issue = {
    ...initial,
    latestOccurrence: {
      ...occurrence,
      runId: 'another-run',
      snapshot: { ...occurrence.snapshot, error: '其他执行实际为999' },
    },
    runOccurrences: [currentOccurrence],
  };

  await page.route(`**/api/runs/${runId}{,?*}`, (route) =>
    route.fulfill({ json: { run: currentRun } }),
  );
  await page.route('**/api/issues?*', (route) =>
    route.fulfill({ json: { issues: [issue], nextCursor: null } }),
  );
  await page.route(`**/api/runs/${runId}/artifacts/${frame.id}`, (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1sAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await runPage.goto(runId);
  const transcript = page.locator('section[aria-label="步骤"]');
  const panel = issuesPage.linkedIssues;

  await expect(transcript.getByRole('button', { name: '查看问题：订单金额错误' })).toBeVisible();
  await expect(panel).toBeHidden();
  await transcript.getByRole('button', { name: '查看问题：订单金额错误' }).click();
  await expect(issuesPage.issuesButton).toHaveAttribute('aria-pressed', 'true');
  await expect(transcript).toBeHidden();
  await expect(panel.getByRole('link', { name: '订单金额错误', exact: true })).toBeVisible();
  await expect(panel.getByText('待确认', { exact: true })).toBeVisible();
  await expect(panel.getByText('P1', { exact: true })).toBeVisible();
  await expect(panel.getByRole('combobox')).toHaveCount(0);
  await expect(panel.getByRole('link', { name: '查看问题详情 ↗', exact: true })).toHaveAttribute(
    'href',
    `/issues/${issueId}`,
  );
  await expect(runPage.playbackTime).toHaveText('00:26 / 00:32');
  await page.screenshot({ path: testInfo.outputPath('run-issues.png'), fullPage: true });
  await panel.getByRole('button', { name: '定位步骤', exact: true }).click();
  await expect(transcript).toBeVisible();
  await expect(transcript.getByText('实际为120', { exact: true })).toBeVisible();
  await expect(runPage.playbackTime).toHaveText('00:26 / 00:32');
});

test('lists linked issues together and shows a clear empty state', async ({
  page,
  issuesPage,
  runPage,
}) => {
  const secondId = '62534c46-a8eb-4991-993e-af6df14bece5';
  const secondOccurrence = {
    ...occurrence,
    id: secondId,
    snapshot: { ...occurrence.snapshot, error: '优惠金额为10' },
  };
  let entries = [
    { ...initial, runOccurrences: [occurrence] },
    { ...initial, id: secondId, title: '优惠金额错误', runOccurrences: [secondOccurrence] },
  ];

  await page.route(`**/api/runs/${runId}{,?*}`, (route) => route.fulfill({ json: { run } }));
  await page.route('**/api/issues?*', (route) =>
    route.fulfill({ json: { issues: entries, nextCursor: null } }),
  );
  await runPage.goto(runId);
  await issuesPage.issuesButton.click();
  const panel = issuesPage.linkedIssues;

  await expect(panel.getByRole('listitem')).toHaveCount(2);
  await expect(panel.getByRole('link', { name: '订单金额错误', exact: true })).toBeVisible();
  await expect(panel.getByRole('link', { name: '优惠金额错误', exact: true })).toBeVisible();
  await expect(panel.getByRole('combobox')).toHaveCount(0);
  entries = [];
  await page.reload();
  await issuesPage.issuesButton.click();
  await expect(panel.getByText('本次执行暂无关联问题', { exact: true })).toBeVisible();
});

test('English issue list and detail translate labels while preserving issue content', async ({
  page,
  context,
}) => {
  await context.addCookies([{ name: 'locale', value: 'en', url: 'http://127.0.0.1:3100' }]);
  await page.route('**/api/issues{,?*}', (route) =>
    route.fulfill({ json: { issues: [initial], nextCursor: null } }),
  );
  await page.route(`**/api/issues/${issueId}`, (route) =>
    route.fulfill({
      json: { issue: initial, occurrences: [occurrence], verifications: [] },
    }),
  );
  await page.goto('/issues');
  await expect(page.getByRole('textbox', { name: 'Search issues', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Open', exact: true })).toBeVisible();
  await expect(page.getByRole('cell').filter({ hasText: 'High' })).toBeVisible();
  await page.getByRole('link', { name: initial.title, exact: true }).click();
  await expect(page.getByRole('heading', { name: initial.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark resolved', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Verification', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Verification', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close verification', exact: true }).click();
  await page.getByRole('button', { name: 'Issue actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Edit issue', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit issue', exact: true });

  await expect(editor.getByLabel('Issue title', { exact: true })).toHaveValue(initial.title);
  await expect(editor.getByRole('combobox', { name: 'Severity', exact: true })).toContainText(
    'High',
  );
  await editor.getByRole('combobox', { name: 'Issue status', exact: true }).click();
  await expect(
    page.getByRole('option', { name: 'Pending verification', exact: true }),
  ).toBeVisible();
});

test('lists occurrences once and opens regression verification for a selected row', async ({
  page,
}) => {
  const olderId = '62534c46-a8eb-4991-993e-af6df14bece4';
  const detail: IssueDetail = {
    issue: initial,
    occurrences: [
      occurrence,
      {
        ...occurrence,
        id: olderId,
        createdAt: '2026-09-30T00:00:00Z',
        snapshot: { ...occurrence.snapshot, name: '历史订单验证', error: '历史金额错误' },
      },
    ],
    verifications: [],
  };

  await page.route(`**/api/issues/${issueId}`, (route) => route.fulfill({ json: detail }));
  await page.route(`**/api/runs/${runId}/recording`, (route) =>
    route.fulfill({ json: { versions: [{ id: 'recording-v1', createdAt: timestamp }] } }),
  );
  await page.route(`**/api/issues/${issueId}/verifications`, (route) => {
    expect(route.request().postDataJSON()).toEqual({ occurrenceId: olderId });
    detail.verifications = [
      {
        id: 'pending-verification',
        issueId,
        occurrenceId: olderId,
        runId,
        createdAt: timestamp,
        runStatus: 'queued',
        outcome: 'pending',
        explanation: '',
      },
    ];

    return route.fulfill({ json: { run } });
  });
  await page.goto(`/issues/${issueId}`);
  const history = page.getByRole('region', { name: '发现记录', exact: true });

  await expect(history.getByRole('row')).toHaveCount(3);
  await expect(history.getByRole('link', { name: '历史订单验证', exact: true })).toHaveAttribute(
    'href',
    `/runs/${runId}`,
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('补充处理说明')).not.toBeVisible();
  await history.getByRole('button', { name: '回归验证：历史订单验证', exact: true }).click();
  const verification = page.getByRole('dialog', { name: '回归验证', exact: true });

  await expect(verification.getByRole('combobox', { name: '选择验证来源' })).toContainText(
    '历史订单验证',
  );
  await verification.getByRole('combobox', { name: '选择验证来源' }).click();
  await page.getByRole('option', { name: /验证订单/ }).click();
  await expect(page.getByRole('button', { name: '发起回归验证' })).toHaveCount(1);
  await verification.getByRole('button', { name: '加载录制版本', exact: true }).click();
  await expect(verification.getByRole('button', { name: '刷新录制版本' })).toBeVisible();
  await verification
    .getByRole('combobox', { name: `验证版本：${occurrence.snapshot.name}` })
    .click();
  await page.getByRole('option', { name: /录制版本 ·/ }).click();
  await verification.getByRole('combobox', { name: '选择验证来源' }).click();
  await page.getByRole('option', { name: /历史订单验证/ }).click();
  await expect(
    verification.getByRole('combobox', { name: '验证版本：历史订单验证' }),
  ).toContainText('当前用例');
  await verification.getByRole('button', { name: '发起回归验证' }).click();
  await expect(verification.getByRole('button', { name: '验证中', exact: true })).toBeDisabled();
  await expect(verification.getByRole('combobox', { name: '选择验证来源' })).toBeDisabled();
  await expect(verification.getByRole('link', { name: '查看回归执行' })).toBeVisible();
});

test('issue evidence and regression controls fit a narrow phone', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const detail: IssueDetail = {
    issue: { ...initial, title: '订单金额错误：' + '长标题'.repeat(16) },
    occurrences: [{ ...occurrence, snapshot: { ...occurrence.snapshot, testId: undefined } }],
    verifications: [],
  };

  await page.route(`**/api/issues/${issueId}`, (route) => route.fulfill({ json: detail }));
  await page.route(`**/api/runs/${runId}/recording`, (route) =>
    route.fulfill({ json: { versions: [] } }),
  );
  await page.goto(`/issues/${issueId}`);
  await expect(page.getByRole('heading', { name: detail.issue.title })).toBeVisible();
  const latest = page.getByRole('region', { name: '最近出现' });
  const expected = latest.getByRole('heading', { name: '预期 EXPECTED' });
  const actual = latest.getByRole('heading', { name: '实际 ACTUAL' });
  const expectedBounds = await expected.boundingBox();
  const actualBounds = await actual.boundingBox();

  expect(actualBounds!.y).toBeGreaterThan(expectedBounds!.y + expectedBounds!.height);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({ path: testInfo.outputPath('issue-detail-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '回归验证', exact: true }).click();
  const verification = page.getByRole('dialog', { name: '回归验证', exact: true });

  await expect(verification.getByText('此执行暂无可用的录制版本。')).toBeVisible();
  await expect(verification.getByRole('button', { name: '发起回归验证' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await verification.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('issue-detail-mobile-verification.png') });
});

test('shows the observed value in Actual and keeps diagnostics collapsed', async ({ page }) => {
  const error =
    'Error: expect(locator).toHaveText(expected) failed\n\nExpected: "100"\nReceived: "120"\n\nCall log:\n  - waiting for locator(".amount")';
  const detail: IssueDetail = {
    issue: initial,
    occurrences: [
      {
        ...occurrence,
        snapshot: {
          ...occurrence.snapshot,
          step: { ...run.steps[0], evidence: '订单金额为100', error },
          error,
        },
      },
    ],
    verifications: [],
  };

  await page.route(`**/api/issues/${issueId}`, (route) => route.fulfill({ json: detail }));
  await page.goto(`/issues/${issueId}`);
  const latest = page.getByRole('region', { name: '最近出现' });

  await expect(latest.getByText('实际值："120"', { exact: true })).toBeVisible();
  const actual = latest.getByRole('heading', { name: '实际 ACTUAL' }).locator('..');

  await expect(actual.getByText('订单金额为100', { exact: true })).toHaveCount(0);
  await expect(latest.locator('pre')).toBeHidden();
  await latest.getByText('错误详情', { exact: true }).click();
  await expect(latest.locator('pre')).toHaveText(error);
  await expect(page.getByText('问题描述', { exact: true })).toHaveCount(0);
});

test('confirms issue deletion, keeps failures recoverable and refreshes the issue list', async ({
  page,
}) => {
  let deleted = false;
  let attempts = 0;

  await page.route('**/api/issues{,?*}', (route) =>
    route.fulfill({ json: { issues: deleted ? [] : [initial], nextCursor: null } }),
  );
  await page.route(`**/api/issues/${issueId}`, (route) => {
    if (route.request().method() === 'DELETE') {
      attempts++;
      if (attempts === 1)
        return route.fulfill({ status: 500, json: { message: '删除失败，请重试。' } });
      deleted = true;

      return route.fulfill({ json: { success: true } });
    }

    return route.fulfill({
      json: { issue: initial, occurrences: [occurrence], verifications: [] },
    });
  });
  await page.goto('/issues');
  await page.getByRole('link', { name: initial.title, exact: true }).click();
  const actions = page.getByRole('button', { name: '问题操作', exact: true });

  await actions.click();
  await page.getByRole('menuitem', { name: '删除问题', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '删除问题', exact: true });

  await expect(dialog).toContainText(initial.title);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(actions).toBeFocused();
  expect(attempts).toBe(0);
  await actions.click();
  await page.getByRole('menuitem', { name: '删除问题', exact: true }).click();
  await dialog.getByRole('button', { name: '删除问题', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('删除失败，请重试。');
  await dialog.getByRole('button', { name: '删除问题', exact: true }).click();
  await expect(page).toHaveURL('/issues');
  await expect(page.getByText('暂无问题', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: initial.title, exact: true })).toHaveCount(0);
  expect(attempts).toBe(2);
});
