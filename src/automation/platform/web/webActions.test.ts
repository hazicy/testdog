import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { StepSchema, type Target } from '../../compiler/schema';
import { executeWebAction } from './webActions';
import { locateWebElement } from './webLocator';
import { PlaywrightSession } from './playwrightSession';

const ActionSchema = StepSchema.options[0];

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
beforeEach(async () => {
  page = await browser.newPage({ hasTouch: true });
  await page.setContent(`
    <label>Name<input id="name" placeholder="Your name" onkeydown="this.dataset.key=event.key"></label>
    <button data-testid="submit" onpointerup="this.dataset.pointer=event.pointerType">Submit</button>
    <button>Submit again</button>
  `);
});
afterEach(async () => {
  await page.context().close();
});
afterAll(async () => {
  await browser.close();
});

it('fills inputs, presses keys and preserves mouse versus touch dispatch', async () => {
  await executeWebAction(
    page,
    ActionSchema.parse({ type: 'fill', target: { kind: 'label', value: 'Name' }, value: 'Ada' }),
  );
  await executeWebAction(
    page,
    ActionSchema.parse({ type: 'press', target: { kind: 'css', value: '#name' }, value: 'enter' }),
  );
  expect(await page.locator('#name').inputValue()).toBe('Ada');
  expect(await page.locator('#name').getAttribute('data-key')).toBe('Enter');
  const click = ActionSchema.parse({
    type: 'click',
    target: { kind: 'testId', value: 'submit' },
    value: '',
  });

  await executeWebAction(page, click);
  expect(await page.getByTestId('submit').getAttribute('data-pointer')).toBe('mouse');
  await executeWebAction(page, click, true);
  expect(await page.getByTestId('submit').getAttribute('data-pointer')).toBe('touch');
});

it('preserves exact role matching, explicit index selection and unsafe selector rejection', async () => {
  const role: Target = { kind: 'role', value: 'button', name: 'Submit' };

  expect(await locateWebElement(page, role).count()).toBe(1);
  expect(await locateWebElement(page, { ...role, name: '', index: 1 }).textContent()).toBe(
    'Submit again',
  );
  for (const value of ['', '/html/body', 'button:nth-child(1)', 'xpath=//button'])
    expect(() => locateWebElement(page, { kind: 'css', value, name: '' })).toThrow(
      '不接受绝对路径或 DOM 序号定位',
    );
});

it('allows the platform session to perform and check actions using the extracted helpers', async () => {
  const session = new PlaywrightSession('web-actions', page);
  const signal = new AbortController().signal;

  try {
    await session.perform(
      {
        platform: 'web',
        action: ActionSchema.parse({
          type: 'fill',
          target: { kind: 'placeholder', value: 'Your name' },
          value: 'Ada',
        }),
      },
      signal,
    );
    await expect(
      session.check(
        {
          platform: 'web',
          type: 'value',
          target: { kind: 'label', value: 'Name', name: '' },
          value: 'Ada',
        },
        signal,
      ),
    ).resolves.toMatchObject({ passed: true });
  } finally {
    await session.close();
  }
});
