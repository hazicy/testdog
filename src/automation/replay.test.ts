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
                  step:
                    input.steps.length === 0
                      ? { ...flow.steps[0], expected: null }
                      : flow.steps[input.steps.length],
                }
              : {
                  done: true,
                  reason: 'fixture complete',
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
