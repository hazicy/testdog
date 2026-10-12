import { WebTargetSchema } from '@testdog/contracts/automation/platform/target';
import { expect, test } from '@playwright/test';
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

test('creates, edits, comments, closes and reopens an issue', async ({ page }) => {
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
  await page.goto('/issues');
  await expect(page.getByText('暂无问题。可从执行记录的失败节点创建问题。')).toBeVisible();
  await page.getByRole('button', { name: '新建问题' }).click();
  await page.getByLabel('问题标题', { exact: true }).fill('订单金额错误');
  await page.getByLabel('问题描述', { exact: true }).fill('预期100，实际120');
  await page.getByRole('button', { name: '保存问题', exact: true }).click();
  await expect(page).toHaveURL(`/issues/${issueId}`);
  await expect(page.getByRole('heading', { name: '订单金额错误', exact: true })).toBeVisible();
  await page.getByLabel('补充处理说明').fill('已修正优惠计算，等待回归。');
  await page.getByRole('button', { name: '添加说明' }).click();
  await expect(
    page.getByRole('region', { name: '处理记录' }).getByText('已修正优惠计算，等待回归。'),
  ).toBeVisible();
  await page.getByRole('button', { name: '编辑问题' }).click();
  await page.getByRole('combobox', { name: '问题状态' }).click();
  await page.getByRole('option', { name: '已关闭', exact: true }).click();
  await page.getByRole('button', { name: '保存问题', exact: true }).click();
  await expect(page.getByText('关闭原因：已修复')).toBeVisible();
  await page.getByRole('button', { name: '编辑问题' }).click();
  await page.getByRole('combobox', { name: '问题状态' }).click();
  await page.getByRole('option', { name: '待确认', exact: true }).click();
  await page.getByRole('button', { name: '保存问题', exact: true }).click();
  await expect(page.getByText('关闭原因：已修复')).toHaveCount(0);
});

test('creates an issue from a failed board node and starts a regression without auto-closing', async ({
  page,
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
  await page.goto(`/runs/${runId}`);
  await page.getByRole('button', { name: '计划画板', exact: true }).click();
  await page
    .locator('[data-plan-node="amount"]')
    .getByRole('button', { name: '创建或关联问题' })
    .click();
  await expect(page.getByLabel('问题标题', { exact: true })).toHaveValue('订单金额为100');
  await expect(page.getByLabel('问题描述', { exact: true })).toHaveValue(/实际为120/);
  await page.getByRole('button', { name: '保存问题', exact: true }).click();
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

test('links a failed step to an existing issue and filters the issue list', async ({ page }) => {
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
  await page.goto(`/runs/${runId}`);
  await page
    .getByRole('region', { name: '执行步骤' })
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
  await page.getByRole('button', { name: '复制修复提示词', exact: true }).click();
  await expect(page.getByRole('button', { name: '已复制修复提示词' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('实际为120');
  await page.getByRole('button', { name: '标记已解决', exact: true }).click();
  await expect(page.getByText('关闭原因：已修复')).toBeVisible();
  await page.getByRole('button', { name: '重新打开', exact: true }).click();
  await expect(page.getByText('关闭原因：已修复')).toHaveCount(0);
});

test('opens an issue tab from the transcript and synchronizes it with replay', async ({
  page,
  context,
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
  await page.goto(`/runs/${runId}`);
  const transcript = page.locator('section[aria-label="执行步骤"]');
  const panel = page.getByRole('region', { name: '执行关联问题', exact: true });

  await expect(transcript.getByRole('button', { name: '查看问题：订单金额错误' })).toBeVisible();
  await expect(panel).toBeHidden();
  await transcript.getByRole('button', { name: '查看问题：订单金额错误' }).click();
  await expect(page.getByRole('button', { name: '问题', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(transcript).toBeHidden();
  await expect(panel.getByText('预期 EXPECTED')).toBeVisible();
  await expect(panel.getByText('实际为120', { exact: true })).toBeVisible();
  await expect(page.getByText('其他执行实际为999')).toHaveCount(0);
  await expect(page.locator('.run-studio > [aria-label="执行关联问题"]')).toHaveCount(0);
  await expect(page.getByLabel('回放时间', { exact: true })).toHaveText('00:26 / 00:32');
  await page.screenshot({ path: testInfo.outputPath('run-issues-default.png'), fullPage: true });
  await expect(panel.getByText('查看订单', { exact: true })).toBeVisible();
  await panel.getByText('截图证据 · 1', { exact: true }).click();
  await panel.getByRole('button', { name: '回放证据 00:26' }).click();
  await expect(page.getByLabel('回放时间', { exact: true })).toHaveText('00:26 / 00:32');
  await panel.getByRole('button', { name: '复制修复提示词', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('实际为120');
  await panel.getByRole('combobox', { name: '问题状态：订单金额错误' }).click();
  await page.getByRole('option', { name: '已关闭', exact: true }).click();
  await expect(panel.getByRole('combobox', { name: '问题状态：订单金额错误' })).toContainText(
    '已关闭',
  );
  await panel.locator('.run-issue-body').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(panel.getByRole('button', { name: '已复制修复提示词', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('run-issues.png'), fullPage: true });
  await page.getByRole('button', { name: '执行步骤', exact: true }).click();
  await expect(transcript).toBeVisible();
  await expect(page.getByLabel('回放时间', { exact: true })).toHaveText('00:26 / 00:32');
});

test('selects among issues in the issue tab and shows a clear empty state', async ({ page }) => {
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
  await page.goto(`/runs/${runId}`);
  await page.getByRole('button', { name: '问题', exact: true }).click();
  const panel = page.getByRole('region', { name: '执行关联问题', exact: true });

  await expect(panel.getByText('本次执行 · 2 个问题')).toBeVisible();
  await panel.getByRole('combobox', { name: '选择执行问题' }).click();
  await page.getByRole('option', { name: '02 · 优惠金额错误', exact: true }).click();
  await expect(panel.getByRole('heading', { name: '优惠金额错误', exact: true })).toBeVisible();
  await expect(panel.getByText('优惠金额为10', { exact: true })).toBeVisible();
  await expect(panel.getByText('实际为120', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '执行回放', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  entries = [];
  await page.reload();
  await page.getByRole('button', { name: '问题', exact: true }).click();
  await expect(panel.getByRole('heading', { name: '本次执行暂无关联问题' })).toBeVisible();
});
