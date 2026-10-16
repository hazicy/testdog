import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { recordAction } from '@testdog/automation/platform/web/recordingLocator';
import type { AriaNode } from '@testdog/automation/platform/web/observationView';
import { Observer } from '@testdog/automation/platform/web/observer';
import { locateWebElement } from '@testdog/automation/platform/web/webLocator';
import { executeWebAction } from '@testdog/automation/platform/web/webActions';
import { parseRecordingScript, recordingScript } from '@testdog/contracts/runs/lib/recordingScript';

let browser: Browser;
let page: Page;

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

it('normalizes a ref with an accessible name and round trips through script persistence', async () => {
  const markup =
    '<span id="dimension">归属维度</span><select aria-labelledby="dimension"><option>团队</option></select>';

  await page.setContent(markup);
  const observation = await new Observer().observe(page);
  const field = nodes(observation.tree).find((node) => node.role === 'combobox')!;

  expect(field.ref).toBeTruthy();
  const recorded = await recordAction(page, {
    type: 'click',
    target: { kind: 'ariaRef', value: field.ref!, name: '' },
    value: '',
  });

  expect(recorded.replayable).toBe(true);
  expect(recorded.action).toMatchObject({
    target: { kind: 'css', value: expect.stringContaining('归属维度') },
  });
  const [saved] = parseRecordingScript(
    recordingScript([
      {
        kind: 'action',
        title: '选择归属维度',
        pageId: 'page-1',
        action: { platform: 'web', action: recorded.action },
      },
    ]),
  );

  if (saved.action?.platform !== 'web') throw new Error('Expected Web action');
  const action = saved.action.action;
  const { sensitive, ...replayAction } = recorded.action;

  expect(sensitive).toBe(false);
  expect(action).toEqual(replayAction);
  await page.setContent(markup);
  if (action.type === 'wait') throw new Error('Expected click');
  expect(await locateWebElement(page, action.target).getAttribute('aria-labelledby')).toBe(
    'dimension',
  );
  await executeWebAction(page, action);
});

it('keeps password sensitivity when normalizing a target', async () => {
  await page.setContent('<label>密码<input type="password"></label>');
  const recorded = await recordAction(page, {
    type: 'fill',
    target: { kind: 'label', value: '密码', name: '' },
    value: 'secret',
  });

  expect(recorded.replayable).toBe(true);
  expect(recorded.action).toMatchObject({ sensitive: true });
});

it('does not mark a selector for a different element as replayable', async () => {
  await page.setContent('<button>First</button><button>Second</button>');
  const prototype = Object.getPrototypeOf(page.getByRole('button'));
  const normalize = vi
    .spyOn(prototype, 'normalize')
    .mockResolvedValue(page.getByRole('button', { name: 'Second' }));
  const action = {
    type: 'click' as const,
    target: { kind: 'role' as const, value: 'button', name: 'First' },
    value: '',
  };

  try {
    const recorded = await recordAction(page, action);

    expect(recorded.replayable).toBe(false);
    expect(recorded.action).toMatchObject(action);
  } finally {
    normalize.mockRestore();
  }
});
