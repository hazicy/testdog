import { expect, test } from '@playwright/test';
import { mockWorkspaceSupport, mockLists, mockRun } from './fixtures/routes';
import { makeCase, makeRun, summarizeRun } from './fixtures/workspace';

test('language and theme persist across refresh and navigation', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('tab', { name: '通用', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('combobox', { name: '语言', exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('tabpanel', { name: 'General', exact: true })
      .getByRole('combobox', { name: 'Language' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Theme', exact: true })).toBeHidden();
  await page.getByRole('tab', { name: 'General', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Theme', exact: true }).click();
  await page.getByRole('option', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in to testdog' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/settings');
  await page.getByRole('combobox', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: '中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.getByRole('combobox', { name: '主题', exact: true }).click();
  await page.getByRole('option', { name: '浅色', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('unsupported preference cookies fall back to Chinese and light theme', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'locale', value: 'invalid', url: 'http://127.0.0.1:3100' },
    { name: 'theme', value: 'invalid', url: 'http://127.0.0.1:3100' },
  ]);
  await page.goto('/settings');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('combobox', { name: '语言', exact: true })).toContainText('中文');
});

test('English workspace supports search, row actions and test settings', async ({
  page,
  context,
}) => {
  const saved = makeCase();
  const run = makeRun({ status: 'passed' }, saved);

  await context.addCookies([{ name: 'locale', value: 'en', url: 'http://127.0.0.1:3100' }]);
  await mockWorkspaceSupport(page);
  await mockLists(page, { tests: [saved], latestRuns: [summarizeRun(run)] });
  await page.goto('/cases');
  await expect(page.getByRole('textbox', { name: 'Search tests', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Filter by status' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Latest status' })).toBeVisible();
  await expect(page.locator('[data-slot="status"]').first()).toHaveText(/Passed/);
  await page.getByRole('button', { name: `More actions: ${saved.name}` }).click();
  await expect(
    page.getByRole('menuitem', { name: `Edit ${saved.name}`, exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'New test', exact: true }).click();
  await page.getByRole('button', { name: 'Expand panel', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Test name', exact: true })).toHaveValue(
    /^New test /,
  );
  await expect(page.getByRole('combobox', { name: 'Platform', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Platform', exact: true }).click();
  await page.getByRole('option', { name: 'Android · Native app', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'App ID', exact: true })).toBeVisible();
});

test('English run workspace renders translated panels and playback controls', async ({
  page,
  context,
}) => {
  const run = makeRun();
  const errors: string[] = [];

  page.on('console', (message) => {
    if (/MISSING_MESSAGE|INVALID_MESSAGE|FORMATTING_ERROR/.test(message.text()))
      errors.push(message.text());
  });
  await context.addCookies([{ name: 'locale', value: 'en', url: 'http://127.0.0.1:3100' }]);
  await mockWorkspaceSupport(page);
  await mockRun(page, run);
  await page.goto(`/runs/${run.id}`);
  await expect(page.getByRole('link', { name: 'Back to runs', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rerun', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Playback', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Issues', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Recording script', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Recording script editor', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

for (const locale of ['zh', 'en'] as const) {
  test(`${locale} home page localizes the demo and respects the dark theme on a phone`, async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: 'locale', value: locale, url: 'http://127.0.0.1:3100' },
      { name: 'theme', value: 'dark', url: 'http://127.0.0.1:3100' },
    ]);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      locale === 'en' ? 'Let AI handle testing.' : '把测试交给 AI。',
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      locale === 'en' ? /Write test cases in natural language/ : /用自然语言编写测试用例/,
    );
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(
      await page
        .locator('main')
        .evaluate((main) => getComputedStyle(main.parentElement!).backgroundColor),
    ).toBe('rgb(25, 25, 25)');
    await page
      .getByRole('tab', { name: locale === 'en' ? 'Form submission' : '表单提交', exact: true })
      .click();
    await expect(
      page.getByRole('tabpanel', {
        name: locale === 'en' ? 'Form submission' : '表单提交',
        exact: true,
      }),
    ).toContainText(locale === 'en' ? 'Submission successful' : '提交成功');
    await page
      .locator('summary')
      .filter({
        hasText: locale === 'en' ? 'Do I need to write test scripts?' : '需要编写测试脚本吗？',
      })
      .click();
    await expect(
      page.getByText(
        locale === 'en' ? /Describe the steps and expected results/ : /描述步骤和预期即可/,
      ),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (locale === 'en') {
      expect(await page.locator('body').innerText()).not.toMatch(/[\u3400-\u9fff]/);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: '/tmp/caseforge-home-en-dark.png', fullPage: true });
    }
  });
}

test('English canvas inserts localized default node content', async ({ page, context }) => {
  await context.addCookies([{ name: 'locale', value: 'en', url: 'http://127.0.0.1:3100' }]);
  await mockWorkspaceSupport(page);
  await mockLists(page, { tests: [], latestRuns: [] });
  await page.goto('/cases');
  await page.getByRole('button', { name: 'New test', exact: true }).click();
  await page.locator('[data-ui="step-insert-trigger"]').first().click();
  await page.getByRole('menuitem').filter({ hasText: /^Act/ }).click();
  const content = page.getByRole('textbox', { name: /^Node content / });

  await expect(content).toBeFocused();
  await expect(content).toHaveValue('Describe the action');
});
