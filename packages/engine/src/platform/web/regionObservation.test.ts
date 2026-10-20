import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Observer } from '@testdog/engine/platform/web/observer';
import {
  findAriaNode,
  observationView,
  type AriaNode,
} from '@testdog/engine/platform/web/observationView';
import type { ObservationRequest } from '@testdog/engine/platform/contracts';
import { PlaywrightSession } from '@testdog/engine/platform/web/playwrightSession';
import { WebActionPlanner } from '@testdog/engine/platform/web/webPlanner';
import { PlanRunner } from '@testdog/engine/planRunner';
import type { ModelClient } from '@testdog/engine/llm/contracts';

let browser: Browser;
let page: Page;
const observer = new Observer();

async function observe(request?: ObservationRequest) {
  const raw = await observer.observe(page, request);

  return { ...raw, view: observationView(raw.tree, raw.requestedRegion) };
}

function nodes(tree: AriaNode[]): AriaNode[] {
  return tree.flatMap((node) => [node, ...nodes(node.children || [])]);
}

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
beforeEach(async () => {
  page = await browser.newPage();
});
afterEach(async () => {
  await page.context().close();
});
afterAll(async () => {
  await browser.close();
});

it('lets the caller select an ordinary div containing duplicate controls without modal or ARIA attributes', async () => {
  await page.setContent(`
    <label>归属维度<input></label>
    <div id="import"><h2>导入标签</h2><label>归属维度<input></label><button>确认导入</button></div>
  `);
  const initial = await observe();
  const region = nodes(initial.view.tree).find(
    (node) =>
      node.ref &&
      node.children?.some((child) => child.role === 'heading' && child.name === '导入标签'),
  );

  expect(nodes(initial.view.tree).filter((node) => node.role === 'textbox')).toHaveLength(2);
  expect(region).toBeDefined();
  const detailed = await observe({ ref: region!.ref! });
  const fields = nodes(detailed.view.tree).filter((node) => node.role === 'textbox');

  expect(fields).toHaveLength(1);
  await page.locator(`aria-ref=${fields[0].ref}`).fill('test');
  expect(await page.locator('#import input').inputValue()).toBe('test');
  expect(await page.locator('body > label input').inputValue()).toBe('');
  expect(nodes(detailed.tree).filter((node) => node.role === 'textbox')).toHaveLength(2);
});

it('exposes a newly opened unrelated portal in the global overview and lets the caller switch regions', async () => {
  await page.setContent(`
    <div><h2>Import</h2><button onclick="document.querySelector('#choices').hidden=false">Choose dimension</button></div>
    <div id="choices" hidden><h2>Dimensions</h2><button onclick="this.dataset.selected='yes'">test</button></div>
  `);
  const initial = await observe();
  const region = nodes(initial.view.tree).find(
    (node) =>
      node.ref &&
      node.children?.some((child) => child.role === 'heading' && child.name === 'Import'),
  )!;
  const detail = await observe({ ref: region.ref! });
  const trigger = nodes(detail.view.tree).find((node) => node.role === 'button')!;

  await page.locator(`aria-ref=${trigger.ref}`).click();
  const opened = await observe({ ref: region.ref! });
  const choiceRegion = nodes(opened.view.overview!).find(
    (node) =>
      node.ref &&
      node.children?.some((child) => child.role === 'heading' && child.name === 'Dimensions'),
  )!;

  expect(nodes(opened.view.tree).some((node) => node.name === 'test')).toBe(false);
  expect(choiceRegion).toBeDefined();
  const options = await observe({ ref: choiceRegion.ref! });
  const option = nodes(options.view.tree).find((node) => node.name === 'test')!;

  await page.locator(`aria-ref=${option.ref}`).click();
  expect(
    await page.getByRole('button', { name: 'test', exact: true }).getAttribute('data-selected'),
  ).toBe('yes');
  expect((await observe({ ref: '' })).view.region).toBeUndefined();
});

it('expands omitted table data on request and retains usable refs', async () => {
  await page.setContent(
    '<table><tbody>' +
      Array.from({ length: 20 }, (_, i) => `<tr><td><button>Row ${i}</button></td></tr>`).join('') +
      '</tbody></table>',
  );
  const initial = await observe();
  const group = nodes(initial.view.tree).find(
    (node) => node.role === 'rowgroup' && node.omittedChildren,
  )!;

  expect(group.omittedChildren).toBe(18);
  expect(nodes(initial.view.tree).some((node) => node.name === 'Row 19')).toBe(false);
  const expanded = await observe({ ref: group.ref! });
  const last = nodes(expanded.view.tree).find(
    (node) => node.role === 'button' && node.name === 'Row 19',
  )!;

  await page.locator(`aria-ref=${last.ref}`).click();
});

it('falls back to a fresh overview when the selected region disappears', async () => {
  await page.setContent('<div><h2>Import</h2><input><button>Confirm</button></div>');
  const initial = await observe();
  const region = nodes(initial.view.tree).find((node) => node.role === 'generic' && node.ref)!;

  await page.setContent('<button>New page</button>');
  const changed = await observe({ ref: region.ref! });

  expect(changed.view.missingRegion).toBe(region.ref);
  expect(findAriaNode(changed.view.tree, region.ref!)).toBeUndefined();
  expect(JSON.stringify(changed.view.tree)).toContain('New page');
});

it('inspects the selected region before filling its control by ref', async () => {
  await page.setContent(
    '<label>Dimension<input></label><div id="import"><h2>Import</h2><label>Dimension<input></label><button>Confirm</button></div>',
  );
  const events = vi.fn();
  const session = new PlaywrightSession('regions', page, { onStep: events });
  let calls = 0;
  const generate = vi.fn<ModelClient['generate']>(async (params) => {
    const block = params.messages[0].content;

    if (Array.isArray(block) || block.type !== 'text')
      throw new Error('Expected planning observation');
    const observation = JSON.parse(block.text).observation;
    let name = 'done';
    let args: Record<string, unknown> = {};

    if (calls === 0) {
      const region = nodes(observation.tree).find(
        (node) =>
          node.ref &&
          node.children?.some((child) => child.role === 'heading' && child.name === 'Import'),
      )!;

      name = 'observe';
      args = { ref: region.ref! };
    } else if (calls === 1) {
      expect(observation.region).toBeDefined();
      const fields = nodes(observation.tree).filter((node) => node.role === 'textbox');

      expect(fields).toHaveLength(1);
      name = 'fill';
      args = { ref: fields[0].ref!, value: 'region-value' };
    }

    calls++;

    return {
      role: 'assistant',
      content: { type: 'text', text: '' },
      outputFormat: 'text',
      toolCalls: [{ id: `tool-${calls}`, name, arguments: JSON.stringify(args) }],
    };
  });

  try {
    await new PlanRunner({
      session,
      planner: new WebActionPlanner({ generate }),
      evaluator: { evaluate: vi.fn() },
      signal: new AbortController().signal,
      plan: {
        rootId: 'task',
        nodes: {
          task: {
            id: 'task',
            kind: 'task',
            goal: 'Fill Dimension in Import',
            dependsOn: [],
            requirementIds: [],
            assertions: [],
          },
        },
      },
    }).record();
    expect(await page.locator('#import input').inputValue()).toBe('region-value');
    expect(await page.locator('body > label input').inputValue()).toBe('');
    expect(calls).toBe(3);
    expect(events.mock.calls.map(([event]) => [event.phase, event.action.action.type])).toEqual([
      ['start', 'fill'],
      ['finish', 'fill'],
    ]);
  } finally {
    await session.close();
  }
});
