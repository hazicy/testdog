import { expect, test, type Page } from '@playwright/test';
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
        tests: state.tests.filter(
          (item) => state.locations.get(item.id) === (params.get('folder') ?? 'root'),
        ),
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

const tree = (page: Page) => page.getByRole('navigation', { name: '用例目录', exact: true });

async function menu(page: Page, name: string, action: string) {
  await tree(page)
    .getByRole('button', { name: `${name} 的操作`, exact: true })
    .click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

async function newFolder(page: Page) {
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('menuitem', { name: '新建文件夹', exact: true }).click();
}

test('creates folders inline, ignores IME Enter, cancels blanks and retries failures', async ({
  page,
}) => {
  const state = await support(page);

  await page.goto('/cases');
  await newFolder(page);
  const input = tree(page).getByRole('textbox', { name: '名称', exact: true });

  await expect(input).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await newFolder(page);
  await page.locator('[data-ui="suite-content"]').click({ position: { x: 10, y: 10 } });
  await expect(input).toHaveCount(0);
  await newFolder(page);
  await input.fill('冒烟');
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  expect(state.creates).toHaveLength(0);
  state.failCreate = true;
  await input.press('Enter');
  await expect(tree(page).getByRole('alert')).toHaveText('保存失败，请重试');
  await expect(input).toHaveValue('冒烟');
  state.failCreate = false;
  await input.press('Enter');
  await expect(page).toHaveURL(`/cases?folder=${childId}`);
  expect(state.creates).toEqual([{ name: '冒烟', parentId: null, testIds: [] }]);
  await expect(tree(page).getByRole('button', { name: '冒烟', exact: true })).toBeVisible();
});

test('folder menus create children and rename on blur without opening a dialog', async ({
  page,
}) => {
  const state = await support(page);

  await page.goto('/cases');
  await menu(page, '回归', '新建子文件夹');
  const input = tree(page).getByRole('textbox', { name: '名称', exact: true });

  await input.fill('冒烟');
  await input.press('Enter');
  await expect(page).toHaveURL(`/cases?folder=${childId}`);
  expect(state.creates[0].parentId).toBe(folderId);
  await menu(page, '冒烟', '重命名');
  await input.fill('每日冒烟');
  await input.press('Tab');
  await expect(tree(page).getByRole('button', { name: '每日冒烟', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await menu(page, '回归', '移动');
  await page.getByRole('combobox', { name: '所属文件夹' }).click();
  await expect(page.getByRole('option', { name: /回归/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('moves a case between root and folder, opens the canvas directly and retains drafts', async ({
  page,
}) => {
  const state = await support(page);

  await page.goto('/cases');
  await tree(page).getByRole('button', { name: '登录', exact: true }).click();
  const canvas = page.locator('[data-ui="case-canvas-page"]');

  await expect(canvas).toBeVisible();
  await canvas.getByLabel('测试名称', { exact: true }).fill('未保存的登录草稿');
  await tree(page).getByRole('button', { name: '搜索', exact: true }).click();
  await expect(canvas.getByLabel('测试名称', { exact: true })).toHaveValue('搜索');
  await tree(page).getByRole('button', { name: '登录', exact: true }).click();
  await expect(canvas.getByLabel('测试名称', { exact: true })).toHaveValue('未保存的登录草稿');
  await canvas.getByRole('button', { name: '保存', exact: true }).click();
  await expect(
    tree(page).getByRole('button', { name: '未保存的登录草稿', exact: true }),
  ).toBeVisible();
  await expect(canvas).toBeVisible();
  await page.screenshot({ path: '/tmp/testdog-case-workbench.png' });
  await menu(page, '搜索', '移动');
  await page.getByRole('combobox', { name: '所属文件夹' }).click();
  await page.getByRole('option', { name: '回归', exact: true }).click();
  await page.getByRole('button', { name: '移动', exact: true }).click();
  await expect.poll(() => state.locations.get(cases[1].id)).toBe(folderId);
  await tree(page).getByRole('button', { name: '回归', exact: true }).click();
  const list = page.getByRole('region', { name: '测试用例列表' });

  await expect(list.getByRole('button', { name: '搜索', exact: true })).toBeVisible();
  await tree(page).getByRole('button', { name: '回归', exact: true }).click();
  await menu(page, '搜索', '移动');
  await page.getByRole('combobox', { name: '所属文件夹' }).click();
  await page.getByRole('option', { name: '根目录', exact: true }).click();
  await page.getByRole('button', { name: '移动', exact: true }).click();
  await expect(list.getByRole('button', { name: '搜索', exact: true })).toHaveCount(0);
  await expect(tree(page).getByRole('button', { name: '搜索', exact: true })).toBeVisible();
});

test('keeps expanded state, creates cases in the selected folder and runs batches from its menu', async ({
  page,
}) => {
  await support(page);
  await page.goto('/cases');
  await tree(page).getByRole('button', { name: '回归', exact: true }).click();
  await tree(page).getByRole('button', { name: '搜索', exact: true }).click();
  await expect(tree(page).getByRole('button', { name: '回归', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await tree(page).getByRole('button', { name: '回归', exact: true }).click();
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('menuitem', { name: '新建用例', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/cases/editor/.*folder=${folderId}`));
  const draft = await page.evaluate(() =>
    Object.keys(sessionStorage)
      .map((key) => sessionStorage.getItem(key))
      .find((raw) => raw?.includes('folderId')),
  );

  expect(JSON.parse(draft!).folderId).toBe(folderId);
  await menu(page, '回归', '运行文件夹');
  await expect(page).toHaveURL(`/cases/batches/${batchId}`);
  await page.getByRole('button', { name: '停止整批执行', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止整批执行', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '返回执行记录', exact: true })).toHaveAttribute(
    'href',
    '/runs',
  );
});

test('deleting a folder returns cases to root and fits small screens', async ({ page }) => {
  await support(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`/cases?folder=${folderId}`);
  await menu(page, '回归', '删除');
  const dialog = page.getByRole('dialog');

  await expect(dialog).toContainText('用例会移至根目录');
  await dialog.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page).toHaveURL('/cases');
  await expect(tree(page).getByRole('button', { name: '登录', exact: true })).toBeVisible();
  await expect(tree(page).getByRole('button', { name: '回归', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('renames a case with a name-only request and keeps its newer content', async ({ page }) => {
  const state = await support(page);

  await page.goto('/cases');
  state.tests[1].goal = 'A newer description from another editor';
  await menu(page, '搜索', '重命名');
  const input = tree(page).getByRole('textbox', { name: '名称', exact: true });
  const name = '搜'.repeat(110);

  await input.fill(name);
  await input.press('Enter');
  await expect(tree(page).getByRole('button', { name, exact: true })).toBeVisible();
  expect(state.tests[1].goal).toBe('A newer description from another editor');
});

test('keeps the case workspace contained, scrolls panels independently and collapses the directory', async ({
  page,
}) => {
  const state = await support(page);

  for (let index = 0; index < 40; index++) {
    const item = makeCase({
      id: `55ed2bde-b647-46d2-9289-${String(index).padStart(12, '0')}`,
      name: `回归用例 ${index + 1}`,
    });

    state.tests.push(item);
    state.locations.set(item.id, 'root');
  }

  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/cases');
  const content = page.locator('[data-ui="suite-content"]');
  const directory = tree(page);

  await expect(content.getByRole('button', { name: '回归用例 1', exact: true })).toBeVisible();
  const surface = page.locator('#main-content');
  const box = await surface.boundingBox();

  expect(box!.y).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(page.viewportSize()!.height * 0.8);
  expect(await surface.evaluate((node) => getComputedStyle(node).borderRadius)).not.toBe('0px');
  await content.evaluate((node) => {
    node.scrollTop = 160;
  });
  expect(await content.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect(await directory.evaluate((node) => node.scrollTop)).toBe(0);
  await directory.evaluate((node) => {
    node.scrollTop = 100;
  });
  expect(await directory.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  const contentScroll = await content.evaluate((node) => node.scrollTop);

  await page.getByRole('button', { name: '收起用例目录', exact: true }).click();
  await expect(directory).toBeHidden();
  expect(await content.evaluate((node) => node.scrollTop)).toBe(contentScroll);
  await page.getByRole('button', { name: '展开用例目录', exact: true }).click();
  await expect(directory).toBeVisible();
  expect(await directory.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  await expect(page.getByRole('button', { name: '展开侧栏', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '收起用例目录', exact: true }).click();
  await expect(directory).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(844);
  await page.getByRole('button', { name: '展开用例目录', exact: true }).click();
  await expect(directory).toBeVisible();
});
