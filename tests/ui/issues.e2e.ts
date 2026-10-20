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
  description: '预期100，实际120',
  status: 'open',
  category: 'product',
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

test('creates, edits, comments, closes and reopens an issue', async ({ page, issuesPage }) => {
  let issue = { ...initial };
  const detail: IssueDetail = { issue, occurrences: [], events: [], verifications: [] };

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
      const { version, comment, ...patch } = route.request().postDataJSON();

      issue = {
        ...issue,
        ...patch,
        version: version + 1,
        closeReason: patch.status === 'open' ? null : (patch.closeReason ?? issue.closeReason),
      };
      detail.issue = issue;
      if (comment)
        detail.events.unshift({
          id: 'event',
          issueId,
          kind: 'comment',
          message: comment,
          createdAt: timestamp,
        });
    }

    return route.fulfill({ json: route.request().method() === 'PATCH' ? { issue } : detail });
  });
  await issuesPage.goto();
  await expect(page.getByText('暂无问题', { exact: true })).toBeVisible();
  await issuesPage.createButton.click();
  await issuesPage.titleInput.fill('订单金额错误');
  await issuesPage.descriptionInput.fill('预期100，实际120');
  await issuesPage.saveButton.click();
  await expect(page).toHaveURL(`/issues/${issueId}`);
  await expect(page.getByRole('heading', { name: '订单金额错误', exact: true })).toBeVisible();
  await page.getByLabel('补充处理说明').fill('已修正优惠计算，等待回归。');
  await page.getByRole('button', { name: '添加说明' }).click();
  await expect(
    page.getByRole('region', { name: '处理记录' }).getByText('已修正优惠计算，等待回归。'),
  ).toBeVisible();
  await issuesPage.editButton.click();
  await issuesPage.statusSelect.click();
  await page.getByRole('option', { name: '已关闭', exact: true }).click();
  await issuesPage.saveButton.click();
  await expect(page.getByText('关闭原因：已修复')).toBeVisible();
  await issuesPage.editButton.click();
  await issuesPage.statusSelect.click();
  await page.getByRole('option', { name: '待确认', exact: true }).click();
  await issuesPage.saveButton.click();
  await expect(page.getByText('关闭原因：已修复')).toHaveCount(0);
});

test('issue editor fits a narrow phone and stacks classification fields', async ({
  page,
  issuesPage,
}) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await page.route('**/api/issues*', (route) =>
    route.fulfill({ json: { issues: [], nextCursor: null } }),
  );
  await issuesPage.goto();
  await issuesPage.createButton.click();
  const dialog = page.getByRole('dialog');

  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const fields = dialog.getByRole('combobox');
  const first = (await fields.nth(0).boundingBox())!;
  const second = (await fields.nth(1).boundingBox())!;

  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
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
    events: [],
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
  await expect(issuesPage.titleInput).toHaveValue('订单金额为100');
  await expect(issuesPage.descriptionInput).toHaveValue(/实际为120/);
  await issuesPage.saveButton.click();
  await expect(page).toHaveURL(`/issues/${issueId}`);
  expect(submittedSource).toEqual({ runId, stepId });
  await expect(
    page.getByRole('region', { name: '问题出现记录' }).getByText('实际为120'),
  ).toBeVisible();
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
      json: { issue: initial, occurrences: [occurrence], events: [], verifications: [] },
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
  await page.getByRole('link', { name: '← 返回问题追踪' }).click();
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
        ],
        nextCursor: null,
      },
    });
  });
  await page.goto('/issues');
  await expect(page.getByRole('link', { name: '订单金额错误', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('issue-list.png'), fullPage: true });
  await page.getByRole('combobox', { name: '筛选环境' }).click();
  await page.getByRole('option', { name: 'Android', exact: true }).click();
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

test('shows expected, actual and reproduction, copies a fix prompt and resolves the issue', async ({
  page,
  context,
  issuesPage,
  workspacePage,
}, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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
    ],
    events: [],
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
  await page.screenshot({ path: testInfo.outputPath('issue-detail.png'), fullPage: true });
  await issuesPage.copyFixPromptButton.click();
  const notifications = workspacePage.notifications;

  await expect(notifications.getByText('已复制修复提示词', { exact: true })).toBeVisible();
  await notifications.getByText('已复制修复提示词', { exact: true }).hover();
  await notifications.getByRole('button', { name: '关闭通知' }).click();
  await expect(notifications.getByText('已复制修复提示词', { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error('Clipboard unavailable');
    };
  });
  await issuesPage.copyFixPromptButton.click();
  await expect(notifications.getByText('复制失败，请检查浏览器剪贴板权限。')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('实际为120');
  await page.getByRole('button', { name: '标记已解决', exact: true }).click();
  await expect(page.getByText('关闭原因：已修复')).toBeVisible();
  await page.getByRole('button', { name: '重新打开', exact: true }).click();
  await expect(page.getByText('关闭原因：已修复')).toHaveCount(0);
});

test('opens an issue tab from the transcript and synchronizes it with replay', async ({
  page,
  context,
  workspacePage,
  issuesPage,
  runPage,
}, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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
  let issue = {
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
  await page.route(`**/api/issues/${issueId}`, (route) => {
    const patch = route.request().postDataJSON();

    expect(patch.version).toBe(issue.version);
    issue = { ...issue, ...patch, version: patch.version + 1 };

    return route.fulfill({ json: { issue } });
  });
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
  await expect(panel.getByText('预期 EXPECTED')).toBeVisible();
  await expect(panel.getByText('实际为120', { exact: true })).toBeVisible();
  await expect(page.getByText('其他执行实际为999')).toHaveCount(0);
  await expect(page.locator('[data-ui~="run-studio"] > [aria-label="执行关联问题"]')).toHaveCount(
    0,
  );
  await expect(runPage.playbackTime).toHaveText('00:26 / 00:32');
  await page.screenshot({ path: testInfo.outputPath('run-issues-default.png'), fullPage: true });
  await expect(panel.getByText('查看订单', { exact: true })).toBeVisible();
  await panel.getByText('截图证据 · 1', { exact: true }).click();
  await panel.getByRole('button', { name: '回放证据 00:26' }).click();
  await expect(runPage.playbackTime).toHaveText('00:26 / 00:32');
  await panel.getByRole('button', { name: '复制修复提示词', exact: true }).click();
  await expect(
    workspacePage.notifications.getByText('已复制修复提示词', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('实际为120');
  await panel.getByRole('combobox', { name: '问题状态：订单金额错误' }).click();
  await page.getByRole('option', { name: '已关闭', exact: true }).click();
  await expect(panel.getByRole('combobox', { name: '问题状态：订单金额错误' })).toContainText(
    '已关闭',
  );
  await panel.locator('[data-ui~="run-issue-body"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(panel.getByRole('button', { name: '复制修复提示词', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('run-issues.png'), fullPage: true });
  await runPage.stepsButton.click();
  await expect(transcript).toBeVisible();
  await expect(runPage.playbackTime).toHaveText('00:26 / 00:32');
});

test('selects among issues in the issue tab and shows a clear empty state', async ({
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

  await expect(panel.getByText('本次执行 · 2 个问题')).toBeVisible();
  await panel.getByRole('combobox', { name: '选择执行问题' }).click();
  await page.getByRole('option', { name: '02 · 优惠金额错误', exact: true }).click();
  await expect(panel.getByRole('heading', { name: '优惠金额错误', exact: true })).toBeVisible();
  await expect(panel.getByText('优惠金额为10', { exact: true })).toBeVisible();
  await expect(panel.getByText('实际为120', { exact: true })).toHaveCount(0);
  await expect(runPage.playbackButton).toHaveAttribute('aria-pressed', 'true');
  entries = [];
  await page.reload();
  await issuesPage.issuesButton.click();
  await expect(panel.getByRole('heading', { name: '本次执行暂无关联问题' })).toBeVisible();
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
      json: { issue: initial, occurrences: [occurrence], events: [], verifications: [] },
    }),
  );
  await page.goto('/issues');
  await expect(page.getByRole('textbox', { name: 'Search issues', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Open', exact: true })).toBeVisible();
  await expect(page.getByRole('cell').filter({ hasText: 'High' })).toBeVisible();
  await page.getByRole('link', { name: initial.title, exact: true }).click();
  await expect(page.getByRole('heading', { name: initial.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark resolved', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Verification', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
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

test('expands occurrence evidence with the keyboard and verifies the selected source', async ({
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
    events: [],
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
  const history = page.getByRole('region', { name: '问题出现记录' });
  const older = history.locator('details').filter({ hasText: '历史订单验证' });

  await expect(history.locator('details[open]')).toHaveCount(1);
  await expect(older.getByText('历史金额错误', { exact: true })).not.toBeVisible();
  await older.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(older.getByText('历史金额错误', { exact: true })).toBeVisible();
  const verification = page.getByRole('region', { name: '回归验证', exact: true });

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
    events: [
      { id: 'event', issueId, kind: 'comment', message: '正在检查支付金额', createdAt: timestamp },
    ],
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
  const verification = page.getByRole('region', { name: '回归验证', exact: true });

  await expect(verification.getByText('此执行暂无可用的录制版本。')).toBeVisible();
  await expect(verification.getByRole('button', { name: '发起回归验证' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({ path: testInfo.outputPath('issue-detail-mobile.png'), fullPage: true });
  await verification.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('issue-detail-mobile-verification.png') });
});
