import type { Page } from '@playwright/test';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import type { RunSummary, TestRun } from '@testdog/contracts/runs/types';

/** Ancillary responses shared by workspace scenarios; behavior-specific routes stay in the test. */
export async function mockWorkspaceSupport(page: Page) {
  await page.route('**/api/workspace/stats', (route) =>
    route.fulfill({
      json: {
        testCount: 1,
        runCount: 1,
        counts: {
          queued: 0,
          preparing: 0,
          running: 0,
          finalizing: 0,
          passed: 1,
          failed: 0,
          cancelled: 0,
        },
      },
    }),
  );
  await page.route('**/model-usage', (route) =>
    route.fulfill({
      json: {
        usage: {
          calls: 0,
          failures: 0,
          retries: 0,
          durationMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          unknownUsage: 0,
        },
        calls: [],
      },
    }),
  );
  await page.route('**/api/builds', (route) => route.fulfill({ json: { builds: [] } }));
  await page.route('**/api/resources', (route) => route.fulfill({ json: { resources: [] } }));
}

export async function mockRun(page: Page, run: TestRun) {
  await page.route(`**/api/runs/${run.id}{,?*}`, (route) => route.fulfill({ json: { run } }));
}

export async function mockLists(
  page: Page,
  response: {
    tests?: TestCase[];
    latestRuns?: RunSummary[];
    runs?: RunSummary[];
    nextCursor?: string | null;
  },
) {
  if (response.tests)
    await page.route(/\/api\/tests(?:\?.*)?$/, (route) => route.fulfill({ json: response }));
  if (response.runs)
    await page.route(/\/api\/runs(?:\?.*)?$/, (route) => route.fulfill({ json: response }));
}

export async function mockScreenshots(page: Page, runId: string) {
  await page.route(`**/api/runs/${runId}/artifacts/*`, (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"/>',
    }),
  );
}
