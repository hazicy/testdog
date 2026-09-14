import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { Executor } from './executor';
import { locate, checkElements } from './abilities';
import { FlowSchema, type Target, type Check } from './compiler';

test('JSON replay submits focused input, follows popup, and reuses ordinal locator after title changes', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const title of ['Old title', 'New title']) {
      const context = await browser.newContext();
      await context.route('https://fixture.test/**', (route) => {
        const url = new URL(route.request().url());
        const html =
          url.pathname === '/video'
            ? '<h1>Video player</h1>'
            : url.pathname === '/results'
              ? `<main data-testid="results"><a href="/video" target="_blank">${title}</a></main>`
              : '<label>Search<input name="q" form="search"></label><form id="search" action="/results" target="_blank"></form>';
        return route.fulfill({ contentType: 'text/html', body: html });
      });
      const target = (
        kind: Target['kind'],
        value: string,
        name = '',
        index = -1,
      ): Target => ({ kind, value, name, index, scope: '' });
      const input = target('label', 'Search');
      const defaults = { mode: 'unique' as const, minCount: 1, inputValue: '' };
      const start: Check = {
        ...defaults,
        urlPattern: '^https://fixture\\.test/$',
        visible: input,
      };
      const results: Check = {
        ...defaults,
        urlPattern: '^https://fixture\\.test/results\\?q=hello$',
        visible: target('testId', 'results'),
      };
      const final: Check = {
        ...defaults,
        urlPattern: '^https://fixture\\.test/video$',
        visible: target('role', 'heading', 'Video player'),
      };
      const flow = FlowSchema.parse(
        JSON.parse(
          JSON.stringify({
            version: 1,
            id: '5f54f400-9b98-4336-80a8-19e0c6248460',
            goal: 'Search hello and open first video',
            createdAt: new Date().toISOString(),
            final,
            steps: [
              {
                type: 'navigate',
                target: input,
                value: 'https://fixture.test/',
                transition: 'same',
                expected: start,
              },
              {
                type: 'fill',
                target: input,
                value: 'hello',
                transition: 'same',
                expected: start,
              },
              {
                type: 'press',
                target: input,
                value: 'Enter',
                transition: 'navigation',
                expected: results,
              },
              {
                type: 'click',
                target: {
                  ...target('role', 'link', '', 0),
                  scope: '[data-testid="results"]',
                },
                value: '',
                transition: 'popup',
                expected: final,
              },
            ],
          }),
        ),
      );
      const result = await new Executor().replay(flow, await context.newPage());
      assert.equal(result.url, 'https://fixture.test/video');
      assert.equal(context.pages().length, 3);
      const ambiguous = await context.newPage();
      await ambiguous.setContent('<button>Go</button><button>Go</button>');
      await assert.rejects(
        locate(ambiguous, target('role', 'button', 'Go')).click(),
        /strict mode violation/,
      );
      const check = { ...start, visible: target('role', 'button', 'Go') };
      assert.equal(
        await checkElements(ambiguous, { ...check, mode: 'any' }),
        true,
      );
      assert.equal(
        await checkElements(ambiguous, { ...check, mode: 'unique' }),
        false,
      );
      assert.equal(
        await checkElements(ambiguous, {
          ...check,
          mode: 'count',
          minCount: 3,
        }),
        false,
      );
      await ambiguous.setContent(
        '<button style="display:none">Go</button><button>Go</button><input aria-label="Query" value="hello">',
      );
      assert.equal(
        await checkElements(ambiguous, { ...check, mode: 'any' }),
        true,
      );
      assert.equal(
        await checkElements(ambiguous, {
          ...start,
          visible: target('label', 'Query'),
          mode: 'value',
          inputValue: 'hello',
        }),
        true,
      );
      assert.equal(
        await checkElements(ambiguous, {
          ...start,
          visible: target('label', 'Query'),
          mode: 'value',
          inputValue: 'wrong',
        }),
        false,
      );
      const recorded = await new Executor().record(
        'Search hello and open first video',
        await context.newPage(),
        {
          async compileIntents() {
            return flow.steps.map((step) => ({
              type: step.type,
              instruction: step.type,
            }));
          },
          async planNext(input) {
            assert.ok(
              input.steps.length < flow.steps.length,
              'must stop after the last requested action',
            );
            return input.steps.length < flow.steps.length
              ? {
                  done: false,
                  reason: 'fixture plan',
                  attention: null,
                  step:
                    input.steps.length === 0
                      ? { ...flow.steps[0], expected: null }
                      : flow.steps[input.steps.length],
                }
              : {
                  done: true,
                  reason: 'fixture complete',
                  attention: null,
                  step: flow.steps.at(-1)!,
                };
          },
        },
      );
      assert.equal(recorded.steps.length, 4);
      assert.equal(recorded.steps[2].transition, 'popup');
      assert.equal(recorded.final, null);
      assert.ok(recorded.steps.every((step) => step.expected === null));
      const replayed = await new Executor().replay(
        recorded,
        await context.newPage(),
      );
      assert.equal(replayed.url, 'https://fixture.test/video');
      await context.close();
    }
  } finally {
    await browser.close();
  }
});

test('recording waits for a client-side navigation to render controls before planning the next action', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route('https://fixture.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<button id="login">Log in</button>
          <script>
            document.querySelector('#login').addEventListener('click', () => {
              history.pushState({}, '', '/manage');
              document.body.innerHTML = '';
              setTimeout(() => {
                document.body.innerHTML = '<button>Chatbot</button>';
              }, 700);
            });
          </script>`,
      }),
    );
    const target = (name: string) => ({
      kind: 'role' as const,
      value: 'button',
      name,
      scope: '',
      index: -1,
    });
    const recorded = await new Executor().record(
      'Log in and open Chatbot',
      await context.newPage(),
      {
        async compileIntents() {
          return [
            { type: 'click' as const, instruction: 'log in' },
            { type: 'click' as const, instruction: 'open Chatbot' },
          ];
        },
        async planNext(input) {
          if (input.steps.length === 1)
            return {
              done: false,
              reason: 'log in',
              attention: null,
              step: {
                type: 'click' as const,
                target: target('Log in'),
                value: '',
                transition: 'navigation' as const,
                expected: null,
              },
            };
          assert.equal(input.url, 'https://fixture.test/manage');
          assert.ok(JSON.stringify(input.elements).includes('Chatbot'));
          return {
            done: false,
            reason: 'open Chatbot',
            attention: null,
            step: {
              type: 'click' as const,
              target: target('Chatbot'),
              value: '',
              transition: 'same' as const,
              expected: null,
            },
          };
        },
      },
      'https://fixture.test/login',
    );
    assert.equal(recorded.steps.length, 3);
    await context.close();
  } finally {
    await browser.close();
  }
});

test('recording exposes dialog scope as locator attention for duplicate controls', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <div><input id="dimensionId" role="combobox" aria-label="归属维度"></div>
      <div role="dialog" aria-label="导入标签">
        <input id="dimensionId" role="combobox" aria-label="归属维度">
      </div>
    `);
    const recorded = await new Executor().record(
      '选择导入标签弹窗里的归属维度',
      page,
      (() => {
        let plans = 0;
        return {
          async compileIntents() {
            return [{ type: 'click' as const, instruction: 'open dimension' }];
          },
          async planNext(input) {
            const elements = input.elements as Array<{
              attributes: { id: string | null };
              container: string;
            }>;
            assert.deepEqual(
              elements
                .filter((element) => element.attributes.id === 'dimensionId')
                .map((element) => element.container),
              ['page', 'dialog: 导入标签'],
            );
            if (++plans === 1)
              return {
                done: false,
                reason: 'initial ambiguous locator',
                attention: null,
                step: {
                  type: 'click' as const,
                  target: {
                    kind: 'css' as const,
                    value: '#dimensionId',
                    name: '',
                    scope: '',
                    index: -1,
                  },
                  value: '',
                  transition: 'same' as const,
                  expected: null,
                },
              };
            assert.deepEqual(input.locatorConflicts, [
              {
                target: {
                  kind: 'css',
                  value: '#dimensionId',
                  name: '',
                  scope: '',
                  index: -1,
                },
                count: 2,
              },
            ]);
            return {
              done: false,
              reason: 'the requested control is in the import dialog',
              attention: {
                location: 'dialog: 导入标签',
                scope: '[role="dialog"]',
              },
              step: {
                type: 'click' as const,
                target: {
                  kind: 'css' as const,
                  value: '#dimensionId',
                  name: '',
                  scope: '',
                  index: -1,
                },
                value: '',
                transition: 'same' as const,
                expected: null,
              },
            };
          },
        };
      })(),
    );
    assert.equal(recorded.steps[0].target.scope, '[role="dialog"]');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('recording identifies a portal listbox separately from its dialog trigger', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <div role="dialog" aria-label="导入标签"><input role="combobox"></div>
      <div role="listbox" aria-label="归属维度选项"><div role="option">测试维度</div></div>
    `);
    await new Executor().record('选择一个维度', page, {
      async compileIntents() {
        return [{ type: 'click' as const, instruction: 'select option' }];
      },
      async planNext(input) {
        const elements = input.elements as Array<{
          text: string;
          container: string;
        }>;
        assert.equal(
          elements.find((element) => element.text === '测试维度')?.container,
          'popup listbox: 归属维度选项',
        );
        return {
          done: false,
          reason: 'select portal option',
          attention: { location: 'popup listbox', scope: '[role="listbox"]' },
          step: {
            type: 'click' as const,
            target: {
              kind: 'role' as const,
              value: 'option',
              name: '测试维度',
              scope: '',
              index: -1,
            },
            value: '',
            transition: 'same' as const,
            expected: null,
          },
        };
      },
    });
    await context.close();
  } finally {
    await browser.close();
  }
});

test('recording observes an Ant Design option without an ARIA option role', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`
      <div class="ant-select-dropdown">
        <div class="ant-select-item ant-select-item-option" title="集成验证维度3">
          <div class="ant-select-item-option-content">集成验证维度3</div>
        </div>
      </div>
    `);
    await new Executor().record('选择集成验证维度3', page, {
      async compileIntents() {
        return [{ type: 'click' as const, instruction: 'select dimension' }];
      },
      async planNext(input) {
        const elements = input.elements as Array<{
          attributes: { title: string | null };
          container: string;
        }>;
        assert.ok(
          elements.some(
            (element) =>
              element.attributes.title === '集成验证维度3' &&
              element.container === 'Ant Design select dropdown: 集成验证维度3',
          ),
        );
        return {
          done: false,
          reason: 'select the rendered Ant Design item',
          attention: {
            location: 'Ant Design select dropdown',
            scope: '.ant-select-dropdown:not(.ant-select-dropdown-hidden)',
          },
          step: {
            type: 'click' as const,
            target: {
              kind: 'css' as const,
              value: '.ant-select-item-option[title="集成验证维度3"]',
              name: '',
              scope: '',
              index: -1,
            },
            value: '',
            transition: 'same' as const,
            expected: null,
          },
        };
      },
    });
    await context.close();
  } finally {
    await browser.close();
  }
});
