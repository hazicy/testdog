import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';

const { Workbook } = createRequire(new URL('../../apps/web/package.json', import.meta.url))(
  'exceljs',
);

import { readFile } from 'node:fs/promises';

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64',
);

test('groups screenshot nodes and downloads an Excel workbook with embedded evidence', async ({
  page,
}) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: null }));
  await page.route('**/api/runs?*', (route) =>
    route.fulfill({
      json: {
        runs: [{ id: 'r1', name: 'UI run', startedAt: '2026-10-17T00:00:00Z' }],
        nextCursor: null,
      },
    }),
  );
  await page.route('**/api/runs/r1', (route) =>
    route.fulfill({
      json: {
        run: {
          id: 'r1',
          name: 'UI run',
          plan: {
            rootId: 'shot',
            nodes: {
              shot: {
                id: 'shot',
                kind: 'task',
                actionType: 'screenshot',
                goal: '登录页面',
                dependsOn: [],
                requirementIds: [],
                assertions: [],
              },
            },
          },
          steps: [{ id: 's1', planNodeId: 'shot', title: '截图', status: 'passed' }],
          artifacts: [{ id: 'a1', stepId: 's1', kind: 'screenshot', contentType: 'image/png' }],
        },
      },
    }),
  );
  await page.route('**/api/runs/r1/artifacts/a1', (route) =>
    route.fulfill({ body: image, contentType: 'image/png' }),
  );
  await page.goto('/plugins');
  await expect(page.getByRole('link', { name: '插件', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.getByRole('combobox', { name: '执行', exact: true }).click();
  await page.getByRole('option', { name: /UI run/ }).click();
  await page.getByRole('checkbox', { name: '登录页面' }).click();
  await page.getByRole('textbox', { name: '分组名称' }).fill('登录验收');
  await page.getByRole('button', { name: '创建分组' }).click();
  const downloadEvent = page.waitForEvent('download');

  await page.getByRole('button', { name: '导出 Excel' }).click();
  const download = await downloadEvent;

  expect(download.suggestedFilename()).toBe('ui-acceptance.xlsx');
  const workbook = new Workbook();
  const bytes = await readFile((await download.path())!);

  await workbook.xlsx.load(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  expect(workbook.worksheets[0].name).toBe('登录验收');
  expect(workbook.worksheets[0].getImages()).toHaveLength(1);
  expect(workbook.worksheets[0].getCell('A2').value).toBe('登录页面');
});
