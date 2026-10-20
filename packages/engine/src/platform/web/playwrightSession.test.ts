import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { PlaywrightSession } from '@testdog/engine/platform/web/playwrightSession';
import { PlanRunner } from '@testdog/engine/planRunner';
import { normalizeReplaySteps } from '@testdog/contracts/runs/lib/replay';
import type { ExecutionStep } from '@testdog/contracts/runs/types';

let browser: Browser;
let page: Page;
let session: PlaywrightSession;
const signal = new AbortController().signal;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
beforeEach(async () => {
  page = await browser.newPage();
  await page.setContent('<button onclick="window.open(\'about:blank\')">Open popup</button>');
  session = new PlaywrightSession('replay', page);
});
afterEach(async () => {
  await session.close();
  await page.context().close();
});
afterAll(async () => {
  await browser.close();
});

it('keeps the popup active during replay of a newPage wait, then selects recorded pages normally', async () => {
  const opened = page.context().waitForEvent('page');

  await session.perform(
    {
      platform: 'web',
      action: {
        type: 'click',
        target: { kind: 'role', value: 'button', name: 'Open popup' },
        value: '',
      },
    },
    signal,
  );
  const popup = await opened;

  await popup.setContent('<h1>Popup ready</h1>');
  const select = vi.spyOn(session, 'selectSurface');
  const wait = {
    platform: 'web' as const,
    action: { type: 'wait' as const, condition: 'newPage' as const, value: '', timeoutMs: 1000 },
  };

  await session.prepareReplayStep(
    { surfaceId: 'page-1', event: { kind: 'wait', title: 'Wait for popup', action: wait } },
    signal,
  );
  expect(select).not.toHaveBeenCalled();
  await session.perform(wait, signal);
  expect((await session.observe(signal)).surface.id).toBe('page-2');
  await session.prepareReplayStep(
    { surfaceId: 'page-1', event: { kind: 'assertion', title: 'Original page' } },
    signal,
  );
  expect((await session.observe(signal)).surface.id).toBe('page-1');
});

it('rejects transient ARIA references before replay dispatch', async () => {
  const perform = vi.spyOn(session, 'perform');
  const planner = { plan: vi.fn() };
  const evaluator = { evaluate: vi.fn() };
  const runner = new PlanRunner({
    session,
    planner,
    evaluator,
    signal,
    plan: { rootId: '', nodes: {} },
  });
  const step = {
    pageId: 'page-1',
    kind: 'action',
    title: 'Click recorded ref',
    action: {
      platform: 'web',
      action: { type: 'click', target: { kind: 'ariaRef', value: 'e1', name: '' }, value: '' },
    },
  } as ExecutionStep;

  await expect(runner.replay(normalizeReplaySteps([step]))).rejects.toThrow('没有稳定定位器');
  expect(perform).not.toHaveBeenCalled();
  expect(planner.plan).not.toHaveBeenCalled();
  expect(evaluator.evaluate).not.toHaveBeenCalled();
});
