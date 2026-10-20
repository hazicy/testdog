import { expect } from '@playwright/test';
import type { Page, Route } from 'playwright';
import { extractDOM } from './dom';
import { compatible, matchesTarget, recall } from './recall';
import {
  planSchema,
  type Action,
  type Candidate,
  type Chooser,
  type Condition,
  type Event,
  type Planner,
  type Step,
} from './types';

export class PolicyDenied extends Error {}

export type AgentOptions = {
  planner: Planner;
  chooser: Chooser;
  // Host policy is mandatory, called for every action, outside model control.
  authorize: (request: {
    task: string;
    action: Action;
    candidate?: Candidate;
    url: string;
  }) => Promise<boolean>;
  allowedOrigins: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
  maxReplans?: number;
  maxActions?: number;
  localAttempts?: number;
  verificationMs?: number;
  topK?: number;
  onEvent?: (event: Event) => void;
};

async function conditionHolds(page: Page, condition: Condition) {
  if (condition.kind === 'url') return page.url().includes(condition.contains);
  if (condition.kind === 'text') {
    for (const frame of page.frames()) {
      for (const match of await frame.getByText(condition.value, { exact: true }).all()) {
        if (await match.isVisible()) return true;
      }
    }

    return false;
  }

  const snapshot = await extractDOM(page);

  try {
    const matches = snapshot.candidates.filter((candidate) =>
      matchesTarget(candidate, condition.target),
    );

    if (matches.length !== 1) return false;
    const handle = snapshot.registry.get(matches[0].id)!;

    if (condition.kind === 'visible') return handle.isVisible();
    if (condition.kind === 'checked') return (await handle.isChecked()) === condition.checked;

    return (await handle.inputValue()) === condition.value;
  } finally {
    await snapshot.dispose();
  }
}

export async function verify(
  page: Page,
  conditions: Condition[],
  signal: AbortSignal,
  timeout = 5000,
) {
  await expect
    .poll(
      async () => {
        signal.throwIfAborted();

        for (const condition of conditions) {
          if (!(await conditionHolds(page, condition))) return false;
        }

        return true;
      },
      { timeout, intervals: [100, 250, 500] },
    )
    .toBe(true);
}

export async function runDOMAgent(page: Page, task: string, options: AgentOptions) {
  const guard = async (route: Route) => {
    const request = route.request();

    if (
      request.isNavigationRequest() &&
      !options.allowedOrigins.includes(new URL(request.url()).origin)
    )
      await route.abort('blockedbyclient');
    else await route.fallback();
  };

  await page.context().route('**/*', guard);
  try {
    return await executeAgent(page, task, options);
  } finally {
    await page.context().unroute('**/*', guard);
  }
}

async function executeAgent(page: Page, task: string, options: AgentOptions) {
  const signal = AbortSignal.any([
    options.signal ?? new AbortController().signal,
    AbortSignal.timeout(options.timeoutMs ?? 120000),
  ]);
  const history: Event[] = [];
  let actions = 0;
  let completion: Condition[] | undefined;
  const uncertainActions = new Set<string>();
  const emit = (goal: string, phase: Event['phase'], detail: string) => {
    const event = { goal, phase, detail };

    history.push(event);
    options.onEvent?.(event);
  };

  const assertOrigin = (url: string) => {
    const parsed = new URL(url);

    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      !options.allowedOrigins.includes(parsed.origin)
    )
      throw new PolicyDenied(`Navigation outside allowed origins: ${parsed.origin}`);
  };

  const authorize = async (action: Action, candidate?: Candidate) => {
    signal.throwIfAborted();
    assertOrigin(page.url());
    if (action.kind === 'navigate') assertOrigin(action.url);
    if (candidate?.href && action.kind === 'click')
      assertOrigin(new URL(candidate.href, candidate.frameUrl).href);
    if (!(await options.authorize({ task, action, candidate, url: page.url() })))
      throw new PolicyDenied('Action rejected by host policy');
    signal.throwIfAborted();
  };

  const consumeAction = () => {
    signal.throwIfAborted();
    if (++actions > (options.maxActions ?? 60)) throw new PolicyDenied('Action budget exhausted');
  };

  const executeStep = async (step: Step) => {
    for (let attempt = 0; attempt < (options.localAttempts ?? 3); attempt++) {
      signal.throwIfAborted();
      let dispatched = false;

      try {
        const action = step.action;
        const fingerprint = JSON.stringify(action);

        if (uncertainActions.has(fingerprint))
          throw new PolicyDenied('Cannot repeat an unreconciled action');

        if ('target' in action) {
          const snapshot = await extractDOM(page);

          try {
            // Count exact matches BEFORE Top-K truncation, so a duplicate cannot masquerade as unique.
            const exact = snapshot.candidates.filter(
              (candidate) =>
                compatible(candidate, action) && matchesTarget(candidate, action.target),
            );
            const candidates = recall(
              action.target,
              action,
              snapshot.candidates,
              options.topK ?? 80,
            );
            const decision =
              exact.length === 1
                ? { kind: 'element' as const, id: exact[0].id }
                : await options.chooser(step, candidates, page.url(), signal);

            if (decision.kind === 'fallback') {
              if (decision.reason === 'need_replan') throw new Error('Replanning requested');
              if (decision.reason === 'need_scroll') {
                await authorize({ kind: 'scroll', direction: 'down' });
                consumeAction();
                await page.mouse.wheel(0, 600);
              }

              if (decision.reason === 'wait') await page.waitForTimeout(250);

              throw new Error(`Choice abstained: ${decision.reason}`);
            }

            const candidate = snapshot.candidates.find((item) => item.id === decision.id);
            const handle = snapshot.registry.get(decision.id);

            if (
              !candidate ||
              !handle ||
              !compatible(candidate, action) ||
              (exact.length !== 1 && !candidates.some((item) => item.id === decision.id))
            )
              throw new Error('Invalid or stale candidate');
            await authorize(action, candidate);
            if (!(await handle.isVisible()) || !(await handle.isEnabled()))
              throw new Error('Element is no longer actionable');
            consumeAction();
            emit(
              step.goal,
              'selected',
              `${exact.length === 1 ? 'locator' : 'choice'}: ${candidate.role} ${candidate.name}`,
            );
            // Once dispatched, even an execution timeout may mean the server received the action.
            dispatched = true;
            if (action.kind === 'click') await handle.click({ timeout: 5000 });
            else if (action.kind === 'press') await handle.press(action.value, { timeout: 5000 });
            else if (action.kind === 'hover') await handle.hover({ timeout: 5000 });
            else if (action.kind === 'fill') await handle.fill(action.value, { timeout: 5000 });
            else if (action.kind === 'select')
              await handle.selectOption(action.value, { timeout: 5000 });
            else await handle.setChecked(action.checked, { timeout: 5000 });
          } finally {
            await snapshot.dispose();
          }
        } else {
          await authorize(action);
          consumeAction();
          dispatched = true;
          if (action.kind === 'navigate')
            await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          else if (action.kind === 'scroll')
            await page.mouse.wheel(0, action.direction === 'down' ? 600 : -600);
        }

        await verify(page, [step.expected], signal, options.verificationMs);
        emit(step.goal, 'verified', 'Postcondition passed');

        return;
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof PolicyDenied) throw error;
        const detail = error instanceof Error ? error.message : String(error);

        emit(step.goal, dispatched ? 'uncertain' : 'retry', detail.slice(0, 1000));
        if (dispatched) {
          // Recheck before replanning: never automatically replay a dispatched action.
          if (await conditionHolds(page, step.expected)) return;
          uncertainActions.add(JSON.stringify(step.action));
          throw new Error(
            `Action may have executed; do not repeat without reconciliation. ${detail}`,
          );
        }

        if (detail === 'Replanning requested') throw error;
      }
    }

    throw new Error('Local recovery exhausted');
  };

  assertOrigin(page.url());
  let failure: string | undefined;

  for (let replan = 0; replan <= (options.maxReplans ?? 2); replan++) {
    signal.throwIfAborted();
    const snapshot = await extractDOM(page);
    let plan;

    try {
      plan = planSchema.parse(
        await options.planner(
          {
            task,
            url: page.url(),
            candidates: snapshot.candidates.slice(0, 200),
            history: history.slice(-40),
            failure,
            completion,
          },
          signal,
        ),
      );
    } finally {
      await snapshot.dispose();
    }

    completion ??= plan.completion;
    try {
      for (const step of plan.steps) await executeStep(step);
      await verify(page, completion, signal, options.verificationMs);

      return { completed: true as const, actions, replans: replan, history };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof PolicyDenied) throw error;
      failure = error instanceof Error ? error.message : String(error);
      emit(task, 'replan', failure.slice(0, 1000));
    }
  }

  throw new Error(`DOM Agent failed: ${failure}`);
}
