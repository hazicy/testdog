import { randomUUID } from 'node:crypto';
import { chromium, expect as browserExpect } from '@playwright/test';
import { expect, it } from 'vitest';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import type { TestRun } from '@testdog/contracts/runs/types';

it.skipIf(!process.env.TESTDOG_UI_URL)(
  'edits native setup and displays run evidence in the real workspace UI',
  async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));
    const tests: TestCase[] = [];
    const buildId = randomUUID();
    const now = new Date().toISOString();
    const runId = randomUUID();
    let run: TestRun | undefined;

    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      let body: unknown;

      if (url.pathname === '/api/tests' && method === 'POST') {
        const test = {
          ...route.request().postDataJSON(),
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
          url: '',
        } as TestCase;

        tests.push(test);
        body = { test };
      } else if (url.pathname === '/api/tests') body = { tests };
      else if (url.pathname === '/api/resources')
        body = {
          resources: [
            { id: 'phone', platform: 'ios', profileId: 'iphone-fixture', status: 'available' },
          ],
          workers: [],
        };
      else if (url.pathname === '/api/builds')
        body = {
          builds: [
            { id: buildId, platform: 'ios', appId: 'com.example.fixture', sha256: 'a'.repeat(64) },
          ],
        };
      else if (url.pathname === `/api/runs/${runId}/recording`) body = { versions: [] };
      else if (url.pathname === `/api/runs/${runId}`) body = { run };
      else if (url.pathname === '/api/runs') body = { runs: [] };
      else body = {};
      await route.fulfill({ json: body });
    });
    try {
      await page.goto(`${process.env.TESTDOG_UI_URL}/cases`);
      await page.getByRole('button', { name: '新建测试', exact: true }).first().click();
      const dialog = page.locator('.case-canvas-page');

      await dialog.getByRole('button', { name: '展开面板', exact: true }).click();

      await dialog.getByLabel('测试名称', { exact: true }).fill('Native fixture');
      await dialog.getByLabel('平台', { exact: true }).click();
      await page.getByRole('option', { name: 'iOS · 原生应用' }).click();
      await dialog.getByLabel('应用标识', { exact: true }).fill('com.example.fixture');
      await dialog.getByLabel('设备配置', { exact: true }).click();
      await page.getByRole('option', { name: 'iphone-fixture' }).click();
      await dialog.getByLabel('应用构建', { exact: true }).click();
      await page.getByRole('option', { name: /com.example.fixture · a{12}/ }).click();
      await dialog.getByLabel('初始化策略', { exact: true }).click();
      await page.getByRole('option', { name: '重新安装所选构建' }).click();
      await dialog.getByLabel('启动链接（可选）', { exact: true }).fill('fixture://login');
      await dialog
        .getByLabel('测试步骤与预期结果', { exact: true })
        .fill('Enter Ada and verify welcome');
      await dialog.getByRole('button', { name: '保存测试', exact: true }).click();
      await browserExpect(page.getByText('Native fixture', { exact: true })).toBeVisible();
      expect(tests[0].target).toMatchObject({
        platform: 'ios',
        buildArtifactId: buildId,
        resetPolicy: 'reinstall',
        launchUrl: 'fixture://login',
      });
      run = {
        id: runId,
        name: 'Native fixture',
        url: '',
        goal: 'Welcome',
        mode: 'record',
        status: 'failed',
        startedAt: now,
        events: [],
        steps: [],
        artifacts: [],
        replayable: false,
        cancelRequested: false,
        evidenceComplete: false,
        targetSnapshot: tests[0].target,
      };
      await page.goto(`${process.env.TESTDOG_UI_URL}/runs/${runId}`);
      await browserExpect(page.getByText(/证据.*完整/).first()).toBeVisible();
      expect(errors).toEqual([]);
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\nPage errors: ${JSON.stringify(errors)}\nPage text: ${await page
          .locator('body')
          .innerText({ timeout: 1000 })
          .then((text) => text.slice(-5000))
          .catch(() => '<unavailable>')}`,
        { cause: error },
      );
    } finally {
      await browser.close();
    }
  },
  60000,
);
