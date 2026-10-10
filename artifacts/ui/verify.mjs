import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];

page.on('pageerror', (e) => errors.push(e.message));
const test = {
  id: '62534c46-a8eb-4991-993e-af6df14bece5',
  name: '登录后显示工作区',
  url: 'https://app.example.com/login',
  goal: '登录并验证欢迎信息',
  tags: ['登录', '核心流程'],
  createdAt: '2026-10-10T01:00:00Z',
  updatedAt: '2026-10-10T01:00:00Z',
};
const run = {
  id: '62534c46-a8eb-4991-993e-af6df14bece6',
  testId: test.id,
  name: test.name,
  url: test.url,
  goal: test.goal,
  mode: 'record',
  status: 'passed',
  startedAt: test.createdAt,
  durationMs: 4200,
  events: [],
  replayable: false,
  cancelRequested: false,
  steps: [],
  artifacts: [],
};

run.steps = [
  {
    id: 'step-login',
    runId: run.id,
    sequence: 1,
    kind: 'navigate',
    title: '打开登录页面',
    status: 'passed',
    startedAt: test.createdAt,
    durationMs: 1200,
    pageId: '1',
    pageUrl: test.url,
    planNodeId: 'login',
    action: { type: 'navigate', target: { kind: 'css', value: '', name: '' }, value: test.url },
    replayable: true,
  },
  {
    id: 'step-check',
    runId: run.id,
    sequence: 2,
    kind: 'assertion',
    title: '验证欢迎信息',
    status: 'passed',
    startedAt: test.createdAt,
    durationMs: 500,
    pageId: '1',
    pageUrl: test.url,
    planNodeId: 'check',
    evidence: '页面显示欢迎回来',
    playwrightAssertion: {
      target: { kind: 'text', value: '欢迎回来', name: '' },
      type: 'toBeVisible',
    },
    replayable: true,
  },
];
run.plan = {
  rootId: 'root',
  nodes: {
    root: {
      id: 'root',
      kind: 'group',
      goal: '登录验证',
      children: ['login', 'check'],
      dependsOn: [],
    },
    login: {
      id: 'login',
      kind: 'task',
      goal: '打开登录页面',
      dependsOn: [],
      requirementIds: [],
      assertions: [],
    },
    check: {
      id: 'check',
      kind: 'task',
      goal: '验证欢迎信息',
      dependsOn: ['login'],
      requirementIds: [],
      assertions: [{ description: '欢迎回来可见' }],
    },
  },
};
await page.route('**/api/**', (route) => {
  const path = new URL(route.request().url()).pathname;
  const body = path.endsWith('/recording')
    ? { versions: [] }
    : path === '/api/tests'
      ? { tests: [test] }
      : path === '/api/runs'
        ? { runs: [run] }
        : { run };

  return route.fulfill({ json: body });
});
for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 });
  for (const path of ['/', '/cases', '/runs', `/runs/${run.id}`]) {
    await page.goto('http://localhost:3001' + path);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.waitForTimeout(600);
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `overflow ${path} ${width}`,
    );
    await page.screenshot({
      path: `artifacts/ui/${path === '/' ? 'home' : path === `/runs/${run.id}` ? 'runs-sample-run' : path.slice(1)}-${width}.png`,
      fullPage: true,
    });
  }
}
await page.goto('http://localhost:3001/');
await page.getByRole('tab', { name: '登录验证' }).focus();
await page.keyboard.press('ArrowRight');
assert.equal(
  await page.getByRole('tab', { name: '表单提交' }).getAttribute('aria-selected'),
  'true',
);
await page.goto('http://localhost:3001/cases');
await page.getByRole('button', { name: '新建测试', exact: true }).click();
await page.getByRole('dialog').waitFor();
assert(await page.getByRole('dialog').evaluate((el) => el.contains(document.activeElement)));
await page.screenshot({ path: 'artifacts/ui/editor-390.png', fullPage: true });
await page.keyboard.press('Escape');
assert.equal(await page.getByRole('dialog').count(), 0);
await page.getByRole('textbox', { name: '搜索测试' }).fill('不存在');
await page.getByText('没有符合条件的记录').waitFor();
await page.getByRole('button', { name: '清除筛选' }).click();
await page.getByRole('button', { name: test.name, exact: true }).waitFor();
for (const width of [390, 1440]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`http://localhost:3001/runs/${run.id}`);
  await page.getByRole('button', { name: '计划画板', exact: true }).click();
  await page.getByRole('button', { name: '查看节点 root', exact: true }).waitFor();
  await page.waitForTimeout(500);
  assert(
    await page
      .locator('.plan-stage')
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a > 0.5),
    'initial plan fit',
  );
  await page.screenshot({ path: `artifacts/ui/plan-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: '编辑录制', exact: true }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `artifacts/ui/recording-${width}.png`, fullPage: true });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'recording overflow',
  );
}
assert.deepEqual(errors, []);
await browser.close();
console.log(
  'Verified desktop/mobile routes, overflow, demo keyboard navigation, dialog focus/Escape, search/reset; no page errors.',
);
