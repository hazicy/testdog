import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { chromium, type Browser } from 'playwright';
import type {
  ActionPlanner,
  AutomationSession,
  ReplayStep,
  SessionEvent,
} from '@testdog/contracts/automation/platform/contracts';
import type { ModelClient, LLMGenerateParams } from '@testdog/contracts/automation/llm/contracts';
import { HybridWebActionPlanner, hybridCandidates } from './hybridPlanner';
import { PlaywrightSession } from './playwrightSession';
import { PlanRunner } from '@testdog/automation/planRunner';
import { budgetedModel, type ModelCallMetric } from '@testdog/automation/llm/budget';
import { ReplanRequiredError } from '@testdog/automation/replanning';
import { Observer } from './observer';
import { recall } from '@testdog/automation/domAgent/recall';
import { targetSchema } from '@testdog/automation/domAgent/types';

type Input = Parameters<ActionPlanner['plan']>[0];
const input = (): Input => ({
  goal: 'Open Issues and filter Bug',
  observation: {
    schemaVersion: 1,
    sessionId: 'unit',
    revision: 0,
    capturedAt: new Date().toISOString(),
    surface: { id: 'page-1', platform: 'web', url: 'https://example.test' },
    tree: [{ ref: 'e1', role: 'link', name: 'Issues' }],
  },
  capabilities: {
    actions: ['click', 'fill', 'press', 'navigate', 'wait'],
    artifacts: [],
    assertions: [],
  },
  completedSteps: [],
  remainingWaitMs: 15000,
});
const semanticPlan = {
  steps: [
    {
      goal: 'Open Issues',
      action: { kind: 'click', target: { name: 'Issues', role: 'link' } },
      expected: { kind: 'url', contains: '/issues' },
    },
    {
      goal: 'Filter Bug for order #1234',
      action: {
        kind: 'click',
        target: { name: 'Filter bugs', role: 'button', keywords: ['Bug'], context: ['#1234'] },
      },
      expected: { kind: 'url', contains: 'label=bug' },
    },
  ],
  completion: [{ kind: 'url', contains: 'label=bug' }],
};
const response = (plan = semanticPlan) => ({
  role: 'assistant' as const,
  content: { type: 'text' as const, text: JSON.stringify(plan) },
  outputFormat: 'json_schema' as const,
  toolCalls: [],
  callId: 'plan-call',
});
const session = {
  check: vi.fn().mockResolvedValue({ passed: true }),
} as unknown as AutomationSession;

it('builds repeated-control candidates with nearest row context and disabled state', () => {
  const result = hybridCandidates(
    [
      { role: 'row', name: 'Order #1234', children: [{ role: 'button', name: 'Bug', ref: 'e1' }] },
      { role: 'group', disabled: true, children: [{ role: 'button', name: 'Bug', ref: 'e2' }] },
      { role: 'heading', name: 'Issues', ref: 'e3' },
    ],
    'https://example.test',
  );

  expect(result).toHaveLength(2);
  expect(result[0].context).toContain('#1234');
  expect(result[1].enabled).toBe(false);
});

it('caches a multi-step plan and resolves fresh refs after navigation', async () => {
  const generate = vi.fn().mockResolvedValue(response());
  const chooser = vi
    .fn()
    .mockResolvedValue({ kind: 'element', id: 'e99', modelCallId: 'jev-call' });
  const planner = new HybridWebActionPlanner(
    { generate },
    session,
    new AbortController().signal,
    chooser,
  );
  const state = input();
  const first = await planner.plan(state);

  expect(first.steps[0]).toMatchObject({ action: { target: { value: 'e1' } } });
  state.completedSteps.push(first.steps[0]);
  state.observation.surface.url = 'https://example.test/issues';
  state.observation.tree = [
    { role: 'row', name: 'Order #1234', children: [{ role: 'button', name: 'Bug', ref: 'e99' }] },
  ];
  const second = await planner.plan(state);

  expect(second).toMatchObject({
    modelCallId: 'jev-call',
    steps: [{ action: { target: { value: 'e99' } } }],
  });
  expect(generate).toHaveBeenCalledTimes(1);
  state.completedSteps.push(second.steps[0]);
  state.observation.surface.url += '?label=bug';
  expect(await planner.plan(state)).toMatchObject({ done: true });
  expect(generate).toHaveBeenCalledTimes(1);
});

it('locally retries an action known not to have dispatched without calling the LLM again', async () => {
  const generate = vi.fn().mockResolvedValue(response());
  const planner = new HybridWebActionPlanner({ generate }, session, new AbortController().signal);
  const state = input();

  await planner.plan(state);
  state.previousFailure = { reason: new ReplanRequiredError('Target was obscured').message };
  state.observation.tree = [{ role: 'link', name: 'Issues', ref: 'e20' }];
  expect((await planner.plan(state)).steps[0]).toMatchObject({
    action: { target: { value: 'e20' } },
  });
  expect(generate).toHaveBeenCalledTimes(1);
});

it('resolves again when PlanRunner discarded a decision during a browser revision change', async () => {
  const generate = vi.fn().mockResolvedValue(response());
  const planner = new HybridWebActionPlanner({ generate }, session, new AbortController().signal);
  const state = input();

  await planner.plan(state);
  state.observation.revision++;
  state.observation.tree = [{ role: 'link', name: 'Issues', ref: 'e21' }];
  expect((await planner.plan(state)).steps[0]).toMatchObject({
    action: { target: { value: 'e21' } },
  });
  expect(generate).toHaveBeenCalledTimes(1);
});

it('does not replay a dispatched action whose postcondition never appeared', async () => {
  const generate = vi.fn().mockResolvedValue(response());
  const planner = new HybridWebActionPlanner({ generate }, session, new AbortController().signal);
  const state = input();
  const first = await planner.plan(state);

  state.completedSteps.push(first.steps[0]);
  state.remainingWaitMs = 0;
  await expect(planner.plan(state)).rejects.toThrow('拒绝重复');
  expect(generate).toHaveBeenCalledTimes(2);
});

it('does not allow a recovery plan to replace the original completion conditions', async () => {
  const generate = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockResolvedValue(
      response({
        steps: [],
        completion: [{ kind: 'url', contains: 'example.test' }],
      }),
    );
  const planner = new HybridWebActionPlanner({ generate }, session, new AbortController().signal);
  const state = input();
  const first = await planner.plan(state);

  state.completedSteps.push(first.steps[0]);
  state.remainingWaitMs = 0;
  await expect(planner.plan(state)).rejects.toThrow('完成条件');
});

it('does not return an invented or out-of-shortlist Choice ID', async () => {
  const generate = vi.fn().mockResolvedValue(response());
  const chooser = vi.fn().mockResolvedValue({ kind: 'element', id: 'invented' });
  const planner = new HybridWebActionPlanner(
    { generate },
    session,
    new AbortController().signal,
    chooser,
  );
  const state = input();

  state.observation.tree = [
    { role: 'link', name: 'Issues', ref: 'e1' },
    { role: 'link', name: 'Issues', ref: 'e2' },
  ];
  await expect(planner.plan(state)).rejects.toBeInstanceOf(ReplanRequiredError);
});

describe('Testdog PlanRunner integration', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });
  afterAll(async () => {
    await browser?.close();
  });

  it('retains editable input comboboxes without allowing select or button comboboxes to receive fill', async () => {
    const page = await browser.newPage();

    try {
      await page.setContent(`<div role="dialog" aria-label="Quick search dialog">
        <input role="combobox" aria-label="Search or jump to">
        <button role="combobox">Choose repository</button>
        <select aria-label="Repository"><option>testdog</option></select>
        <input role="combobox" aria-label="Read only" readonly>
      </div><label>Enter your email<input type="email"></label>`);
      const raw = await page.locator('body').ariaSnapshotJSON({ mode: 'ai' });

      expect(JSON.stringify(raw)).not.toContain('"editable"');
      const observation = await new Observer().observe(page);
      const candidates = hybridCandidates(observation.tree, page.url());
      const target = targetSchema.parse({ name: 'Search or jump to', role: 'combobox' });
      const ranked = recall(target, { kind: 'fill', target, value: 'vscode' }, candidates);

      expect(ranked[0]).toMatchObject({ name: 'Search or jump to', editable: true });
      expect(ranked.map((candidate) => candidate.name)).toEqual([
        'Search or jump to',
        'Enter your email',
      ]);
      const automation = new PlaywrightSession('editable-combobox', page);
      const generate = vi.fn().mockResolvedValue({
        content: {
          text: JSON.stringify({
            steps: [
              {
                goal: 'Search vscode',
                action: { kind: 'fill', target, value: 'vscode' },
                expected: { kind: 'value', target, value: 'vscode' },
              },
            ],
            completion: [{ kind: 'value', target, value: 'vscode' }],
          }),
        },
        toolCalls: [],
      });
      const signal = new AbortController().signal;
      const chooser = vi.fn();
      const planner = new HybridWebActionPlanner({ generate }, automation, signal, chooser);
      const plan = {
        rootId: 'search',
        nodes: {
          search: {
            kind: 'task' as const,
            id: 'search',
            goal: 'Search vscode',
            dependsOn: [],
            requirementIds: [],
            assertions: [],
          },
        },
      };

      try {
        await new PlanRunner({
          plan,
          session: automation,
          planner,
          signal,
          evaluator: { evaluate: vi.fn() },
        }).record();
        expect(await page.getByRole('combobox', { name: 'Search or jump to' }).inputValue()).toBe(
          'vscode',
        );
        expect(generate).toHaveBeenCalledTimes(1);
        expect(chooser).not.toHaveBeenCalled();
      } finally {
        await automation.close();
      }
    } finally {
      await page.context().close();
    }
  });

  it('records and replays cross-page actions, sharing model metrics with Jev', async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const origin = 'http://hybrid.test';

    await context.route(`${origin}/**`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body:
          new URL(route.request().url()).pathname === '/issues'
            ? `<table><tbody>
        <tr><td>Order #1111</td><td><button>Bug</button></td></tr>
        <tr><td>Order #1234</td><td><button onclick="history.pushState({},'', '?label=bug')">Bug</button></td></tr>
      </tbody></table>`
            : '<a href="/issues">Issues</a>',
      }),
    );
    const page = await context.newPage();
    const metrics: ModelCallMetric[] = [];
    const generate = vi.fn(async (params: LLMGenerateParams) => {
      if (params.provider !== 'jev')
        return {
          ...response(),
          model: 'planner-test',
          usage: { inputTokens: 10, outputTokens: 10 },
        };
      const block = params.messages[0].content;

      if (Array.isArray(block) || block.type !== 'text') throw new Error('Expected Choice input');
      const criteria = JSON.parse(block.text).questions.target.criteria as Record<string, string>;
      const id = Object.keys(criteria).find((key) => criteria[key].includes('#1234'))!;

      return {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: JSON.stringify({
            answers: {
              target: { type: 'choice', choice: id, confidence: 0.99, probabilities: { [id]: 1 } },
            },
          }),
        },
        model: 'jev-1.14.0',
        outputFormat: 'json_schema' as const,
        toolCalls: [],
        usage: { inputTokens: 5, outputTokens: 5 },
      };
    });
    const model: ModelClient = budgetedModel(
      { generate },
      {
        timeoutMs: 5000,
        maxCalls: 2,
        maxTokens: 1000,
        maxDurationMs: 10000,
        maxRetries: 0,
        maxOutputTokens: 1000,
      },
      async (metric) => {
        metrics.push(metric);
      },
    );
    const events: SessionEvent[] = [];
    const replay: ReplayStep[] = [];
    const signal = new AbortController().signal;
    const automation = new PlaywrightSession('hybrid', page, {
      onStep: async (event) => {
        events.push(event);
        if (event.phase === 'start' && event.action) {
          const binding = await automation.resolveForRecording(
            event.action,
            automation.latestObservation!,
          );

          expect(binding.replayable).toBe(true);
          replay.push({ surfaceId: 'page-1', event: { ...event, action: binding.action } });
        }
      },
    });
    const planner = new HybridWebActionPlanner(model, automation, signal);
    const plan = {
      rootId: 'task',
      nodes: {
        task: {
          kind: 'task' as const,
          id: 'task',
          goal: input().goal,
          dependsOn: [],
          requirementIds: [],
          assertions: [],
        },
      },
    };
    const evaluator = { evaluate: vi.fn() };

    try {
      await page.goto(origin);
      await new PlanRunner({ plan, session: automation, planner, evaluator, signal }).record();
      expect(page.url()).toContain('label=bug');
      expect(generate).toHaveBeenCalledTimes(2);
      expect(metrics.map((metric) => metric.model)).toEqual(['planner-test', 'jev-1.14.0']);
      expect(
        events.filter((event) => event.phase === 'finish').map((event) => event.modelCallId),
      ).toEqual(metrics.map((metric) => metric.id));
      await automation.close();
      await page.goto(origin);
      const replaySession = new PlaywrightSession('replay-hybrid', page);

      try {
        await new PlanRunner({ plan, session: replaySession, planner, evaluator, signal }).replay(
          replay,
        );
        expect(page.url()).toContain('label=bug');
        expect(generate).toHaveBeenCalledTimes(2);
      } finally {
        await replaySession.close();
      }
    } finally {
      await automation.close();
      await context.close();
    }
  });
});
