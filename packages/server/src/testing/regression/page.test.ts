import { readFile } from 'node:fs/promises';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { regressionCases } from './cases';

let browser: Browser;
const html = await readFile(new URL('./page.html', import.meta.url), 'utf8');

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
});

it.each(regressionCases)('$id has an independent observable result', async (item) => {
  const page = await browser.newPage();
  let observed: string | null = null;

  try {
    await page.route('http://regression.test/**', async (route) => {
      if (route.request().method() === 'POST') {
        observed = route.request().postData();
        await route.fulfill({ body: 'ok' });
      } else await route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto(`http://regression.test/${item.id}/1`);
    if (item.id === 'login') {
      await page.getByLabel('邮箱').fill('ada@example.com');
      await page.getByLabel('密码').fill('TestPassword123!');
      await page.getByRole('button', { name: '登录', exact: true }).click();
    } else if (item.id === 'search' || item.id === 'enter') {
      await page.getByLabel('搜索').fill(item.id === 'search' ? 'Playwright' : 'Chromium');
      if (item.id === 'enter') await page.getByLabel('搜索').press('Enter');
      else await page.getByRole('button', { name: '搜索', exact: true }).click();
    } else if (item.id === 'dialog' || item.id === 'cancel') {
      await page.getByRole('button', { name: '删除草稿', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: item.id === 'dialog' ? '确认删除' : '取消', exact: true })
        .click();
    } else if (item.id === 'select') {
      await page.getByLabel('城市').selectOption({ label: '上海' });
      await page.getByRole('button', { name: '保存城市', exact: true }).click();
    } else if (item.id === 'checkbox') {
      await page.getByLabel('同意条款').check();
      await page.getByRole('button', { name: '继续', exact: true }).click();
    } else if (item.id === 'async') {
      await page.getByRole('button', { name: '加载订单', exact: true }).click();
    } else if (item.id === 'duplicate') {
      await page.getByRole('link', { name: '注册', exact: true }).click();
    } else {
      await page.getByLabel('姓名').fill('Ada');
      await page.getByLabel('邮箱').fill('ada@example.com');
      await page.getByRole('button', { name: '订阅更新', exact: true }).click();
    }

    await page.getByRole('status').filter({ hasText: item.expected }).waitFor();
    expect(observed).toBe(item.expected);
  } finally {
    await page.close();
  }
});
