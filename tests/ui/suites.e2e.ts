import { test, expect } from './fixtures/test.fixture';
import { type Page } from '@playwright/test';
import { makeCase } from './fixtures/workspace';
import { emptyRunCounts } from '../../packages/contracts/src/workspace/types';
import type { SuiteTreeNode } from '../../packages/contracts/src/suites/types';

const folderId = '44ed2bde-b647-46d2-9289-35e91f6dd001';
const childId = '44ed2bde-b647-46d2-9289-35e91f6dd002';
const batchId = '44ed2bde-b647-46d2-9289-35e91f6dd003';
const cases = ['登录', '搜索'].map((name, index) =>
  makeCase({
    id: `44ed2bde-b647-46d2-9289-35e91f6dd01${index}`,
    name,
    plan: {
      rootId: 'root',
      nodes: {
        root: { id: 'root', kind: 'group', goal: name, children: ['open'], dependsOn: [] },
        open: {
          id: 'open',
          kind: 'task',
          actionType: 'navigate',
          goal: 'https://example.com',
          dependsOn: [],
          requirementIds: [],
          assertions: [],
        },
      },
    },
  }),
);

async function support(page: Page) {
  const state = {
    folders: [
      {
        id: folderId,
        name: '回归',
        parentId: null,
        version: 1,
        position: 0,
        testCount: 1,
        totalTestCount: 1,
        updatedAt: '2026-10-17T00:00:00Z',
        tests: [],
      },
    ] as SuiteTreeNode[],
    locations: new Map([
      [cases[0].id, folderId],
      [cases[1].id, 'root'],
    ]),
    tests: cases.map((item) => ({ ...item })),
    creates: [] as { name: string; parentId: string | null; testIds: string[] }[],
    failCreate: false,
    failMove: false,
    moves: [] as { testIds: string[]; folderId: string | null }[],
    stopped: false,
  };

  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: null }));
  await page.route('**/api/events*', (route) =>
    route.fulfill({ contentType: 'text/event-stream', body: 'event: ready\ndata: {}\n\n' }),
  );
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({ json: { tests: 2, runs: 0, counts: emptyRunCounts() } }),
  );
  await page.route('**/api/suites/tree', (route) => {
    const folders = state.folders.map((folder) => ({
      ...folder,
      tests: state.tests.filter((item) => state.locations.get(item.id) === folder.id),
      testCount: state.tests.filter((item) => state.locations.get(item.id) === folder.id).length,
    }));

    return route.fulfill({
      json: {
        folders,
        rootTests: state.tests.filter((item) => state.locations.get(item.id) === 'root'),
      },
    });
  });
  await page.route(/\/api\/tests(?:\?.*)?$/, (route) => {
    const params = new URL(route.request().url()).searchParams;

    return route.fulfill({
      json: {
        tests: state.tests
          .filter(
            (item) =>
              !params.has('folder') || state.locations.get(item.id) === params.get('folder'),
          )
          .map((item) => ({
            ...item,
            folderId: state.locations.get(item.id) === 'root' ? null : state.locations.get(item.id),
          })),
        latestRuns: [],
        nextCursor: null,
      },
    });
  });
  await page.route(/\/api\/tests\/[\da-f-]+$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
    const item = state.tests.find((row) => row.id === id)!;

    if (route.request().method() === 'PATCH') Object.assign(item, route.request().postDataJSON());

    return route.fulfill({ json: { test: item } });
  });
  await page.route('**/api/suites', (route) => {
    if (state.failCreate)
      return route.fulfill({ status: 503, json: { message: '保存失败，请重试' } });
    const input = route.request().postDataJSON();

    state.creates.push(input);
    const id = childId;

    state.folders.push({
      ...state.folders[0],
      id,
      ...input,
      testCount: 0,
      totalTestCount: 0,
      tests: [],
    });

    for (const testId of input.testIds) state.locations.set(testId, id);

    return route.fulfill({ status: 201, json: { id } });
  });
  await page.route(/\/api\/suites\/[\da-f-]+$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
    const item = state.folders.find((folder) => folder.id === id)!;

    if (route.request().method() === 'PATCH') {
      Object.assign(item, route.request().postDataJSON(), { version: item.version + 1 });

      return route.fulfill({ json: { id } });
    }

    if (route.request().method() === 'DELETE') {
      state.folders = state.folders.filter((folder) => folder.id !== id);
      for (const [testId, parent] of state.locations)
        if (parent === id) state.locations.set(testId, 'root');

      return route.fulfill({ status: 204 });
    }

    return route.fulfill({ json: item });
  });
  await page.route(/\/api\/tests\/[\da-f-]+\/name$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!;
    const body = route.request().postDataJSON();

    expect(Object.keys(body)).toEqual(['name']);
    const item = state.tests.find((row) => row.id === id)!;

    item.name = body.name;

    return route.fulfill({ json: { test: item } });
  });
  await page.route(/\/api\/tests\/[\da-f-]+\/folder$/, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!;

    state.locations.set(id, route.request().postDataJSON().folderId ?? 'root');

    return route.fulfill({ json: { success: true } });
  });
  await page.route('**/api/tests/collection', (route) => {
    if (state.failMove)
      return route.fulfill({ status: 503, json: { message: '移动失败，请重试' } });
    const input = route.request().postDataJSON();

    state.moves.push(input);
    for (const testId of input.testIds) state.locations.set(testId, input.folderId ?? 'root');

    return route.fulfill({ json: { success: true } });
  });
  await page.route(`**/api/suites/${folderId}/runs`, (route) =>
    route.fulfill({ status: 202, json: { batchId } }),
  );
  await page.route(`**/api/suite-runs/${batchId}`, (route) => {
    if (route.request().method() === 'DELETE') state.stopped = true;

    return route.fulfill({
      json: {
        id: batchId,
        suiteId: folderId,
        name: '回归',
        total: 1,
        createdAt: '2026-10-17T00:00:00Z',
        cancelRequested: state.stopped,
        status: state.stopped ? 'cancelled' : 'queued',
        counts: { ...emptyRunCounts(), [state.stopped ? 'cancelled' : 'queued']: 1 },
        runs: [],
      },
    });
  });

  return state;
}

async function menu(page: Page, name: string, action: string) {
  await page.getByRole('button', { name: `${name} 的操作`, exact: true }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

test('shows cases inside collapsible groups without a separate directory', async ({ page }) => {
  await support(page);
  await page.goto('/cases');
  await expect(page.getByRole('navigation', { name: '用例目录', exact: true })).toHaveCount(0);
  const group = page.getByRole('button', { name: '折叠 回归', exact: true });

  await expect(group).toBeVisible();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  await group.click();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '搜索', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '展开 回归', exact: true }).click();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
});

test('creates empty groups, validates names and retries a failed save', async ({ page }) => {
  const state = await support(page);

  await page.goto('/cases');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await page.getByRole('menuitem', { name: '新建合集', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const save = dialog.getByRole('button', { name: '保存合集', exact: true });

  await expect(save).toBeDisabled();
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('冒烟');
  state.failCreate = true;
  await save.click();
  await expect(dialog.getByRole('alert')).toHaveText('保存失败，请重试');
  state.failCreate = false;
  await save.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '折叠 冒烟', exact: true })).toBeVisible();
  await expect(page.getByText('尚未添加用例', { exact: true })).toBeVisible();
  expect(state.creates).toEqual([{ name: '冒烟', parentId: null, testIds: [] }]);
});

test('renames collections and creates tests directly inside a collection without nesting', async ({
  page,
}) => {
  await support(page);
  await page.goto('/cases');
  await menu(page, '回归', '重命名');
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('核心回归');
  await page.getByRole('button', { name: '保存合集', exact: true }).click();
  await expect(page.getByRole('button', { name: '折叠 核心回归', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '核心回归 的操作', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '新建子合集', exact: true })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: '移动', exact: true })).toHaveCount(0);
  await page.getByRole('menuitem', { name: '手动添加测试', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/cases/editor/.*folder=${folderId}`));
});

test('moves cases between groups and opens the editor with a return action', async ({ page }) => {
  const state = await support(page);

  await page.goto('/cases');
  await page.getByRole('button', { name: '更多操作：搜索', exact: true }).click();
  await page.getByRole('menuitem', { name: '移至合集', exact: true }).click();
  await page.getByRole('radio', { name: '回归', exact: true }).check();
  await page.getByRole('dialog').getByRole('button', { name: '移动', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.locations.get(cases[1].id)).toBe(folderId);
  await page.getByRole('button', { name: '折叠 回归', exact: true }).click();
  await expect(page.getByRole('button', { name: '搜索', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '展开 回归', exact: true }).click();
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`case=${cases[0].id}`));
  await page.getByRole('button', { name: '全部用例', exact: true }).click();
  await expect(page).toHaveURL('/cases');
});

test('runs batches from group menus and deletes groups without deleting cases', async ({
  page,
}) => {
  const state = await support(page);

  await page.goto('/cases');
  await menu(page, '回归', '运行合集');
  await expect(page).toHaveURL(`/cases/batches/${batchId}`);
  await page.goto('/cases');
  await menu(page, '回归', '删除');
  await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByRole('button', { name: '折叠 回归', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  expect(state.locations.get(cases[0].id)).toBe('root');
});

test('keeps the two-column workspace contained on small screens', async ({ page }) => {
  await support(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cases');
  await expect(page.getByRole('button', { name: '折叠 回归', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('selects cases by row, group and header, and clears selection when switching status', async ({
  page,
}) => {
  await support(page);
  await page.goto('/cases');
  const all = page.getByRole('checkbox', { name: '全选用例', exact: true });
  const login = page.getByRole('checkbox', { name: '选择 登录', exact: true });
  const search = page.getByRole('checkbox', { name: '选择 搜索', exact: true });
  const group = page.getByRole('checkbox', { name: '选择分组 回归', exact: true });

  await login.check();
  await expect(group).toBeChecked();
  await expect(all).toHaveAttribute('aria-checked', 'mixed');
  await all.check();
  await expect(search).toBeChecked();
  await group.uncheck();
  await expect(login).not.toBeChecked();
  await expect(search).toBeChecked();
  await all.check();
  await all.uncheck();
  await expect(search).not.toBeChecked();
  await all.check();
  const statuses = page.getByRole('group', { name: '状态筛选', exact: true });

  await statuses.getByRole('button', { name: '失败', exact: true }).click();
  await expect(page).toHaveURL(/status=failed/);
  await expect(statuses.getByRole('button', { name: '失败', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(all).not.toBeChecked();
  await statuses.getByRole('button', { name: '全部状态', exact: true }).click();
  await expect(all).not.toBeChecked();
});

test('combines creation methods in one menu', async ({ page, caseEditor }) => {
  await support(page);
  await page.goto('/cases');
  await expect(page.getByRole('button', { name: '快速创建', exact: true })).toHaveCount(0);
  await caseEditor.quickCreate();
  await expect(page.getByRole('dialog', { name: '快速创建', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(caseEditor.newTestButton).toBeFocused();
  await caseEditor.create();
  await expect(page).toHaveURL(/\/cases\/editor\//);
});

test('runs one or multiple selected cases as a batch', async ({ page }) => {
  await support(page);
  const submissions: unknown[] = [];

  await page.route('**/api/tests/runs', (route) => {
    submissions.push(route.request().postDataJSON());

    return route.fulfill({ status: 202, json: { batchId } });
  });
  await page.goto('/cases');
  await page.getByRole('checkbox', { name: '选择 登录', exact: true }).check();
  await page.getByRole('button', { name: '运行所选 1', exact: true }).click();
  await expect(page).toHaveURL(`/cases/batches/${batchId}`);
  expect(submissions).toEqual([{ mode: 'selected', testIds: [cases[0].id] }]);
  await page.goto('/cases');
  await page.getByRole('checkbox', { name: '全选用例', exact: true }).check();
  await page.getByRole('button', { name: '运行所选 2', exact: true }).click();
  await expect(page).toHaveURL(`/cases/batches/${batchId}`);
  expect((submissions[1] as { testIds: string[] }).testIds.sort()).toEqual(
    cases.map((item) => item.id).sort(),
  );
});

test('submits the full search, status and folder filter and retries without duplicating requests', async ({
  page,
}) => {
  await support(page);
  const submissions: { payload: unknown; key: string | undefined }[] = [];

  await page.route('**/api/tests/runs', (route) => {
    submissions.push({
      payload: route.request().postDataJSON(),
      key: route.request().headers()['idempotency-key'],
    });

    return submissions.length === 1
      ? route.fulfill({ status: 503, json: { message: '暂时无法执行' } })
      : route.fulfill({ status: 202, json: { batchId } });
  });
  await page.goto(`/cases?folder=${folderId}&q=登录&status=failed`);
  const run = page.getByRole('button', { name: '运行筛选结果', exact: true });

  await run.click();
  await expect(page.getByRole('alert').filter({ hasText: '暂时无法执行' })).toBeVisible();
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page).toHaveURL(`/cases/batches/${batchId}`);
  expect(submissions[0].payload).toEqual({
    mode: 'filtered',
    q: '登录',
    status: 'failed',
    folderId,
  });
  expect(submissions[0].key).toBeTruthy();
  expect(submissions[1]).toEqual(submissions[0]);
});

test('moves selected tests to an existing collection with search, retry and selection cleanup', async ({
  page,
}) => {
  const state = await support(page);

  await page.goto('/cases');
  await expect(page.getByRole('button', { name: '新建合集', exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: '全选用例', exact: true }).check();
  await expect(page.getByText('已选 2 项', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '添加', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '移至合集', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '移至合集', exact: true });
  const move = dialog.getByRole('button', { name: '移动', exact: true });

  await expect(move).toBeDisabled();
  await dialog.getByRole('textbox', { name: '搜索合集', exact: true }).fill('回归');
  await expect(dialog.getByRole('radio', { name: '未分组', exact: true })).toHaveCount(0);
  await dialog.getByRole('radio', { name: '回归', exact: true }).check();
  state.failMove = true;
  await move.click();
  await expect(dialog.getByRole('alert')).toHaveText('移动失败，请重试');
  await expect(page.getByText('已选 2 项', { exact: true })).toBeVisible();
  state.failMove = false;
  await move.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '添加', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: '全选用例', exact: true })).not.toBeChecked();
  expect(state.moves).toHaveLength(1);
  expect(state.moves[0].testIds.sort()).toEqual(cases.map((item) => item.id).sort());
  await page.getByRole('button', { name: '折叠 回归', exact: true }).click();
  await expect(page.getByRole('button', { name: '搜索', exact: true })).toHaveCount(0);
});

test('creates a collection from selected tests inside the move dialog', async ({ page }) => {
  const state = await support(page);

  await page.goto('/cases');
  await page.getByRole('checkbox', { name: '全选用例', exact: true }).check();
  await page.getByRole('button', { name: '移至合集', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '移至合集', exact: true });

  await dialog.getByRole('button', { name: '新建合集', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: '合集名称', exact: true })).toBeFocused();
  const create = dialog.getByRole('button', { name: '创建并移入', exact: true });

  await expect(create).toBeDisabled();
  await dialog.getByRole('textbox', { name: '合集名称', exact: true }).fill('核心流程');
  state.failCreate = true;
  await create.click();
  await expect(dialog.getByRole('alert')).toHaveText('保存失败，请重试');
  expect(state.creates).toHaveLength(0);
  state.failCreate = false;
  await create.click();
  await expect(dialog).toHaveCount(0);
  expect(state.creates).toEqual([
    { name: '核心流程', parentId: null, testIds: cases.map((item) => item.id) },
  ]);
  await expect(page.getByRole('button', { name: '折叠 核心流程', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: '全选用例', exact: true })).not.toBeChecked();
});

test('moves tests back to ungrouped and offers creation inside empty collections', async ({
  page,
}) => {
  await support(page);
  await page.goto('/cases');
  await expect(page.getByRole('button', { name: '折叠 未分组', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '更多操作：登录', exact: true }).click();
  await page.getByRole('menuitem', { name: '移至合集', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '移至合集', exact: true });

  await dialog.getByRole('radio', { name: '未分组', exact: true }).check();
  await dialog.getByRole('button', { name: '移动', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '折叠 未分组', exact: true }).click();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '搜索', exact: true })).toHaveCount(0);
  await expect(page.getByText('尚未添加用例', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '添加测试', exact: true }).click();
  await page.getByRole('menuitem', { name: '手动添加测试', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`folder=${folderId}`));
});

test('AI creation inside a collection preserves membership and closes the overlay', async ({
  page,
}) => {
  await support(page);
  await page.route('**/api/tests/compile', (route) =>
    route.fulfill({ json: { plan: cases[0].plan } }),
  );
  await page.goto('/cases');
  await menu(page, '回归', '使用 AI 添加测试');
  const prompt = page.getByRole('dialog', { name: '快速创建', exact: true });

  await prompt
    .getByRole('textbox', { name: '测试步骤与预期结果', exact: true })
    .fill('打开 https://example.com');
  await prompt.getByRole('button', { name: '生成', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/cases/editor/.*folder=${folderId}`));
  await expect(prompt).toHaveCount(0);
  const draftFolder = await page.evaluate(() => {
    const id = location.pathname.split('/').at(-1);

    return JSON.parse(sessionStorage.getItem(`testdog:case-draft:${id}`)!).folderId;
  });

  expect(draftFolder).toBe(folderId);
});

test('collection chooser fits phones and cancels without changing membership', async ({ page }) => {
  const state = await support(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cases');
  await page.getByRole('checkbox', { name: '全选用例', exact: true }).check();
  await page.getByRole('button', { name: '移至合集', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '移至合集', exact: true });
  const search = dialog.getByRole('textbox', { name: '搜索合集', exact: true });

  await expect(search).toBeFocused();
  await search.fill('不存在');
  await expect(dialog.getByText('没有匹配的合集', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '新建合集', exact: true }).click();
  await dialog.getByRole('textbox', { name: '合集名称', exact: true }).fill('临时合集');
  await expect(dialog.getByRole('button', { name: '创建并移入', exact: true })).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(state.creates).toHaveLength(0);
  expect(state.moves).toHaveLength(0);
  await expect(page.getByText('已选 2 项', { exact: true })).toBeVisible();
});
