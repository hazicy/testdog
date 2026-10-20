import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { TargetSchema, type Step } from '@testdog/contracts/automation/compiler/schema';
import { executeWebAction } from '@testdog/engine/platform/web/webActions';
import { recordAction } from '@testdog/engine/platform/web/recordingLocator';
import { Observer } from '@testdog/engine/platform/web/observer';
import { findAriaNode, type AriaNode } from '@testdog/engine/platform/web/observationView';
import { ReplanRequiredError } from '@testdog/engine/replanning';
import { PlaywrightSession } from '@testdog/engine/platform/web/playwrightSession';

let browser: Browser;
let page: Page;
const markup =
  '<label>Dimension<input></label><div data-testid="import"><h2>Import</h2><label>Dimension<input></label><button>Confirm</button></div>';

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
beforeEach(async () => {
  page = await browser.newPage();
  await page.setContent(markup);
});
afterEach(async () => {
  await page.context().close();
});
afterAll(async () => {
  await browser.close();
});

function region(nodes: AriaNode[]): AriaNode | undefined {
  for (const node of nodes) {
    if (node.ref && node.children?.some((child) => child.name === 'Import')) return node;
    const match = region(node.children || []);

    if (match) return match;
  }
}

function nodes(tree: AriaNode[]): AriaNode[] {
  return tree.flatMap((node) => [node, ...nodes(node.children || [])]);
}

async function action(): Promise<Step> {
  const observation = await new Observer().observe(page);
  const scope = region(observation.tree)!;

  expect(findAriaNode(observation.tree, scope.ref!)).toBeDefined();

  return {
    type: 'fill',
    value: 'test',
    target: TargetSchema.parse({
      kind: 'label',
      value: 'Dimension',
      scope: { kind: 'ariaRef', value: scope.ref },
    }),
  };
}

it('fills only the unique field within the selected ordinary div', async () => {
  const step = await action();

  await executeWebAction(page, step as Exclude<Step, { type: 'wait' }>);
  expect(await page.getByTestId('import').getByLabel('Dimension').inputValue()).toBe('test');
  expect(await page.locator('body > label input').inputValue()).toBe('');
});

it('normalizes a scoped target and replays it without any ARIA refs', async () => {
  const recorded = await recordAction(page, await action());

  expect(recorded.replayable).toBe(true);
  expect(recorded.action).toMatchObject({ target: { kind: 'css' } });
  expect(JSON.stringify(recorded.action)).not.toContain('aria-ref=');
  await page.setContent(markup);
  const session = new PlaywrightSession('scoped-replay', page);
  const signal = new AbortController().signal;
  const step = { platform: 'web' as const, action: recorded.action };

  try {
    await session.prepareReplayStep(
      { surfaceId: 'page-1', event: { kind: 'action', title: 'Fill', action: step } },
      signal,
    );
    await session.perform(step, signal);
    expect(await page.getByTestId('import').getByLabel('Dimension').inputValue()).toBe('test');
    expect(await page.locator('body > label input').inputValue()).toBe('');
  } finally {
    await session.close();
  }
});

it.each([0, 2])(
  'requests new observation before input when the relative locator matches %s fields',
  async (count) => {
    const step = await action();

    await page.getByTestId('import').evaluate((element, count) => {
      element.innerHTML = '<h2>Import</h2>' + '<label>Dimension<input></label>'.repeat(count);
    }, count);
    await expect(
      executeWebAction(page, step as Exclude<Step, { type: 'wait' }>),
    ).rejects.toBeInstanceOf(ReplanRequiredError);
    expect(
      await page
        .locator('input')
        .evaluateAll((elements) =>
          elements.every((element) => !(element as HTMLInputElement).value),
        ),
    ).toBe(true);
  },
);

it('requests a new region when a stable scope disappears', async () => {
  await page.getByTestId('import').evaluate((element) => element.remove());

  await expect(
    executeWebAction(page, {
      type: 'fill',
      value: 'test',
      target: TargetSchema.parse({
        kind: 'label',
        value: 'Dimension',
        scope: { kind: 'testId', value: 'import' },
      }),
    }),
  ).rejects.toBeInstanceOf(ReplanRequiredError);
  expect(await page.locator('input').inputValue()).toBe('');
});

it('requests a new observation when the referenced region disappears', async () => {
  const step = await action();

  await page.getByTestId('import').evaluate((element) => element.remove());
  await expect(
    executeWebAction(page, step as Exclude<Step, { type: 'wait' }>),
  ).rejects.toBeInstanceOf(ReplanRequiredError);
  expect(await page.locator('input').inputValue()).toBe('');
});

it('rejects a transient scope before deterministic replay dispatch', async () => {
  const session = new PlaywrightSession('scoped-replay', page);

  try {
    await expect(
      session.prepareReplayStep(
        {
          surfaceId: 'page-1',
          event: {
            kind: 'action',
            title: 'Fill',
            action: { platform: 'web', action: await action() },
          },
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('没有稳定定位器');
  } finally {
    await session.close();
  }
});

it('rejects positional selection inside a scope', () => {
  expect(
    TargetSchema.safeParse({
      kind: 'role',
      value: 'textbox',
      index: 0,
      scope: { kind: 'testId', value: 'import' },
    }).success,
  ).toBe(false);
});

it('normalizes a control ref inside a scope ref for replay', async () => {
  const step = await action();

  if (step.type === 'wait') throw new Error('Expected fill');
  const scope = step.target.scope!;
  const observation = await new Observer().observe(page);
  const region = findAriaNode(observation.tree, scope.value)!;
  const field = nodes(region.children!).find((node) => node.role === 'textbox')!;
  const scoped = {
    ...step,
    target: TargetSchema.parse({ kind: 'ariaRef', value: field.ref, scope }),
  };

  await executeWebAction(page, scoped);
  const recorded = await recordAction(page, scoped);

  expect(recorded.replayable).toBe(true);
  await page.setContent(markup);
  if (recorded.action.type === 'wait') throw new Error('Expected fill');
  await executeWebAction(page, recorded.action);
  expect(await page.getByTestId('import').getByLabel('Dimension').inputValue()).toBe('test');
  expect(await page.locator('body > label input').inputValue()).toBe('');
});

it('rejects a control ref outside its scope before sending input', async () => {
  const step = await action();

  if (step.type === 'wait') throw new Error('Expected fill');
  const observation = await new Observer().observe(page);
  const background = nodes(observation.tree).find((node) => node.role === 'textbox')!;
  const scoped = {
    ...step,
    target: TargetSchema.parse({
      kind: 'ariaRef',
      value: background.ref,
      scope: step.target.scope,
    }),
  };

  await expect(executeWebAction(page, scoped)).rejects.toBeInstanceOf(ReplanRequiredError);
  expect(await page.locator('body > label input').inputValue()).toBe('');
});
