import { normalizeReplaySteps } from '@testdog/contracts/runs/lib/replay';
import { beforeEach, expect, it, vi } from 'vitest';
import type {
  ActionPlanner,
  AutomationSession,
  Observation,
  SessionEvent,
} from '@testdog/contracts/automation/platform/contracts';
import type { ExecutionStep } from '@testdog/contracts/runs/types';
import { PlanRunner } from '@testdog/automation/planRunner';

import { ReplanRequiredError } from '@testdog/automation/replanning';

const evaluator = { evaluate: vi.fn(async () => ({ passed: true, evidence: 'Verified' })) };

beforeEach(() => vi.clearAllMocks());

const tap = (value: string) => ({
  platform: 'ios' as const,
  action: { type: 'tap' as const, target: { kind: 'identifier' as const, value } },
});

it('forwards AI-selected region observations without recording or dispatching input and resumes the task', async () => {
  const driver = session(false);
  const observed = vi.fn<AutomationSession['observe']>(async (_signal, request) => {
    const observation = await driver.observe();

    return {
      ...observation,
      surface: { platform: 'web', id: 'page' },
      requestedRegion: request?.ref,
    };
  });
  const web = {
    ...driver,
    get revision() {
      return driver.revision;
    },
    platform: 'web' as const,
    observe: observed,
    capabilities: { actions: ['click'], artifacts: [], assertions: [], observations: ['regions'] },
  };
  const click = {
    platform: 'web' as const,
    action: {
      type: 'click' as const,
      target: { kind: 'ariaRef' as const, value: 'e3', name: '' },
      value: '',
    },
  };
  const planner = {
    plan: vi
      .fn<ActionPlanner['plan']>()
      .mockResolvedValueOnce({ done: false, steps: [], observe: { ref: 'e2' } })
      .mockResolvedValueOnce({ done: false, steps: [click] })
      .mockResolvedValue({ done: true, steps: [] }),
  };

  await new PlanRunner({ evaluator, session: web, planner, signal, plan }).record();
  expect(observed.mock.calls.map(([, request]) => request)).toEqual([
    undefined,
    { ref: 'e2' },
    undefined,
  ]);
  expect(driver.perform).toHaveBeenCalledExactlyOnceWith(click, signal);
  expect(planner.plan.mock.calls[1][0]).toMatchObject({
    completedSteps: [],
    observation: { requestedRegion: 'e2' },
  });
  expect(driver.emit.mock.calls.every(([event]) => event.action?.action.type === 'click')).toBe(
    true,
  );
});

it('bounds repeated region inspections without dispatching or recording business actions', async () => {
  const driver = session();
  const web = {
    ...driver,
    get revision() {
      return driver.revision;
    },
    capabilities: { ...driver.capabilities, observations: ['regions'] },
  };
  const planner = {
    plan: vi
      .fn<ActionPlanner['plan']>()
      .mockResolvedValue({ done: false, steps: [], observe: { ref: '' } }),
  };

  await expect(
    new PlanRunner({ evaluator, session: web, planner, signal, plan }).record(),
  ).rejects.toThrow('Exceeded 20 actions');
  expect(driver.perform).not.toHaveBeenCalled();
  expect(driver.emit).not.toHaveBeenCalled();
});

it('rejects region requests mixed with actions or from unsupported sessions', async () => {
  for (const steps of [[], [tap('submit')]]) {
    const driver = session();
    const planner = {
      plan: vi
        .fn<ActionPlanner['plan']>()
        .mockResolvedValue({ done: false, steps, observe: { ref: 'e1' } }),
    };

    await expect(
      new PlanRunner({ evaluator, session: driver, planner, signal, plan }).record(),
    ).rejects.toThrow(steps.length ? 'must not be combined' : 'does not support region');
    expect(driver.perform).not.toHaveBeenCalled();
  }
});

it('reobserves after blocked input without replaying completed actions or dispatching the remaining batch', async () => {
  const driver = session(false);
  const first = tap('first');
  const blocked = tap('blocked');
  const replacement = tap('replacement');

  driver.perform
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new ReplanRequiredError('Blocked before input'))
    .mockResolvedValue(undefined);
  const planner = {
    plan: vi
      .fn<ActionPlanner['plan']>()
      .mockResolvedValueOnce({ done: false, steps: [first, blocked, tap('stale')] })
      .mockResolvedValueOnce({ done: false, steps: [replacement] })
      .mockResolvedValue({ done: true, steps: [] }),
  };

  await new PlanRunner({ evaluator, session: driver, planner, signal, plan }).record();
  expect(driver.perform.mock.calls.map(([action]) => action)).toEqual([
    first,
    blocked,
    replacement,
  ]);
  expect(planner.plan.mock.calls[1][0]).toMatchObject({
    completedSteps: [first],
    previousFailure: { reason: 'Blocked before input', action: blocked },
  });
  expect(planner.plan.mock.calls[1][0].observation).not.toBe(
    planner.plan.mock.calls[0][0].observation,
  );
  expect(driver.emit).toHaveBeenCalledWith(
    expect.objectContaining({ phase: 'error', action: blocked }),
  );
});

it('limits recovery to two replans per task', async () => {
  const driver = session();

  driver.perform.mockRejectedValue(new ReplanRequiredError('Still blocked'));
  const planner = {
    plan: vi
      .fn<ActionPlanner['plan']>()
      .mockResolvedValue({ done: false, steps: [tap('blocked')] }),
  };

  await expect(
    new PlanRunner({ evaluator, session: driver, planner, signal, plan }).record(),
  ).rejects.toThrow('Still blocked');
  expect(planner.plan).toHaveBeenCalledTimes(3);
  expect(driver.perform).toHaveBeenCalledTimes(3);
});

it('reobserves an invalid planned ref before dispatching any input', async () => {
  const driver = session();
  const planner = {
    plan: vi
      .fn<ActionPlanner['plan']>()
      .mockRejectedValueOnce(new ReplanRequiredError('Invalid ref'))
      .mockResolvedValueOnce({ done: false, steps: [tap('current')] })
      .mockResolvedValue({ done: true, steps: [] }),
  };

  await new PlanRunner({ evaluator, session: driver, planner, signal, plan }).record();
  expect(driver.perform).toHaveBeenCalledOnce();
  expect(planner.plan.mock.calls[1][0]).toMatchObject({
    completedSteps: [],
    previousFailure: { reason: 'Invalid ref' },
  });
});

it('does not replan errors with uncertain dispatch or failed evidence capture', async () => {
  for (const error of [
    new Error('Navigation timed out after click'),
    new AggregateError([new ReplanRequiredError('Blocked'), new Error('Evidence failed')]),
  ]) {
    const driver = session();

    driver.perform.mockRejectedValue(error);
    const planner = {
      plan: vi
        .fn<ActionPlanner['plan']>()
        .mockResolvedValue({ done: false, steps: [tap('submit')] }),
    };

    await expect(
      new PlanRunner({ evaluator, session: driver, planner, signal, plan }).record(),
    ).rejects.toBe(error);
    expect(planner.plan).toHaveBeenCalledOnce();
  }
});

it('never replans a blocked deterministic replay', async () => {
  const driver = session();

  driver.perform.mockRejectedValue(new ReplanRequiredError('Blocked'));
  const planner = { plan: vi.fn() };

  await expect(
    new PlanRunner({ evaluator, session: driver, planner, signal, plan }).replay([
      { surfaceId: 'app', event: { kind: 'action', title: 'Submit', action: tap('submit') } },
    ]),
  ).rejects.toThrow('Blocked');
  expect(planner.plan).not.toHaveBeenCalled();
});

it('associates every dispatched action in a batch with its model and tool call', async () => {
  const driver = session(false);
  const planner = {
    plan: vi
      .fn<ActionPlanner['plan']>()
      .mockResolvedValueOnce({
        done: false,
        modelCallId: 'model-1',
        toolCallIds: ['tool-a', 'tool-b'],
        steps: [
          { platform: 'ios', action: { type: 'tap', target: { kind: 'identifier', value: 'a' } } },
          { platform: 'ios', action: { type: 'tap', target: { kind: 'identifier', value: 'b' } } },
        ],
      })
      .mockResolvedValue({ done: true, steps: [] }),
  };

  await new PlanRunner({ evaluator, session: driver, planner, signal, plan }).record();
  expect(
    driver.emit.mock.calls
      .filter(([event]) => event.phase === 'finish')
      .map(([event]) => [event.modelCallId, event.toolCallId]),
  ).toEqual([
    ['model-1', 'tool-a'],
    ['model-1', 'tool-b'],
  ]);
});

it('associates a failed AI assertion with its model call', async () => {
  const driver = session();
  const planner = {
    plan: vi.fn<ActionPlanner['plan']>().mockResolvedValue({ done: true, steps: [] }),
  };
  const failing = {
    evaluate: vi.fn(async () => ({
      passed: false,
      evidence: 'Missing heading',
      modelCallId: 'model-assertion',
    })),
  };
  const checkedPlan = {
    ...plan,
    nodes: { task: { ...plan.nodes.task, assertions: [{ description: 'Heading is visible' }] } },
  };

  await expect(
    new PlanRunner({
      evaluator: failing,
      session: driver,
      planner,
      signal,
      plan: checkedPlan,
    }).record(),
  ).rejects.toThrow('Missing heading');
  expect(driver.emit).toHaveBeenCalledWith(
    expect.objectContaining({ phase: 'error', modelCallId: 'model-assertion', kind: 'assertion' }),
  );
});

const signal = new AbortController().signal;
const plan = {
  rootId: 'task',
  nodes: {
    task: {
      id: 'task',
      kind: 'task' as const,
      goal: 'Submit',
      dependsOn: [],
      requirementIds: [],
      assertions: [],
    },
  },
};

function session(reobserveAfterAction = true) {
  let revision = 0;

  return {
    id: 'device',
    executionPolicy: { reobserveAfterAction },
    prepareReplayStep: vi.fn(async () => {}),
    platform: 'ios' as const,
    capabilities: { actions: ['tap'], artifacts: ['screenshot'], assertions: ['text'] },
    get revision() {
      return revision;
    },
    observe: vi.fn(async (): Promise<Observation> => ({
      schemaVersion: 1,
      sessionId: 'device',
      revision: ++revision,
      capturedAt: new Date().toISOString(),
      surface: { platform: 'ios', id: 'app' },
    })),
    perform: vi.fn<AutomationSession['perform']>(async () => {}),
    emit: vi.fn<(event: SessionEvent) => Promise<void>>(async () => {}),
    check: vi.fn(async () => ({ passed: true, evidence: 'Welcome Ada' })),
    close: vi.fn(),
    wait: vi.fn(),
    capture: vi.fn(),
    resolveForRecording: vi.fn(),
  } satisfies AutomationSession;
}

it('rejects conditional dependency escapes before dispatching an initial action', async () => {
  const driver = session();
  const planner = { plan: vi.fn() };
  const unsafe = {
    rootId: 'root',
    nodes: {
      root: {
        id: 'root',
        kind: 'group' as const,
        goal: '测试',
        children: ['branch', 'after'],
        dependsOn: [],
      },
      branch: {
        id: 'branch',
        kind: 'branch' as const,
        condition: '条件',
        then: 'task',
        dependsOn: [],
      },
      task: plan.nodes.task,
      after: { ...plan.nodes.task, id: 'after', dependsOn: ['task'] },
    },
  };

  await expect(
    new PlanRunner({ evaluator, session: driver, planner, signal, plan: unsafe }).record({
      platform: 'ios',
      action: { type: 'tap', target: { kind: 'identifier', value: 'submit' } },
    }),
  ).rejects.toThrow('请依赖分支节点');
  expect(driver.perform).not.toHaveBeenCalled();
  expect(planner.plan).not.toHaveBeenCalled();
});

it('never invokes action planning when replaying a deterministic platform check', async () => {
  const driver = session();
  const planner = {
    plan: vi.fn(async () => {
      throw new Error('replanning forbidden');
    }),
  };
  const runner = new PlanRunner({ evaluator, session: driver, planner, signal, plan });
  const step = {
    id: 'check',
    title: 'Welcome',
    kind: 'assertion',
    platformAssertion: {
      platform: 'ios',
      type: 'text',
      target: { kind: 'identifier', value: 'welcome' },
      value: 'Welcome Ada',
    },
  } as ExecutionStep;

  await runner.replay(normalizeReplaySteps([step]));
  expect(planner.plan).not.toHaveBeenCalled();
  expect(driver.check).toHaveBeenCalledOnce();
  driver.check.mockResolvedValue({ passed: false, evidence: 'Missing welcome label' });
  await expect(runner.replay(normalizeReplaySteps([step]))).rejects.toThrow('Missing welcome');
});
it('retains the command failure and evidence failure when error capture also fails', async () => {
  const driver = session();

  driver.perform.mockRejectedValue(new Error('device disconnected'));
  driver.emit.mockImplementation(async (event) => {
    if (event.phase === 'error') throw new Error('snapshot unavailable');
  });
  const runner = new PlanRunner({
    evaluator,
    session: driver,
    signal,
    plan,
    planner: { plan: vi.fn() },
  });
  const error = await runner
    .record({
      platform: 'ios',
      action: { type: 'tap', target: { kind: 'identifier', value: 'submit' } },
    })
    .catch((error) => error);

  expect(error).toBeInstanceOf(AggregateError);
  expect(error.errors.map((error: Error) => error.message)).toEqual([
    'device disconnected',
    'snapshot unavailable',
  ]);
});
it('limits native actions per task even when a planner never reports completion', async () => {
  const driver = session();
  const runner = new PlanRunner({
    evaluator,
    session: driver,
    signal,
    plan,
    planner: {
      plan: async () => ({
        done: false,
        steps: [
          {
            platform: 'ios',
            action: { type: 'tap', target: { kind: 'identifier', value: 'submit' } },
          },
        ],
      }),
    },
  });

  await expect(runner.record()).rejects.toThrow('Exceeded 20 actions');
  expect(driver.perform).toHaveBeenCalledTimes(20);
});

it.each([true, false])(
  'uses the injected execution policy for batching, regardless of platform: %s',
  async (reobserveAfterAction) => {
    const driver = session();

    driver.executionPolicy.reobserveAfterAction = reobserveAfterAction;
    const planner = {
      plan: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          steps: ['first', 'second'].map((value) => ({
            platform: 'ios',
            action: { type: 'tap', target: { kind: 'identifier', value } },
          })),
        })
        .mockResolvedValueOnce({ done: true, steps: [] }),
    };
    const runner = new PlanRunner({ evaluator, session: driver, planner, signal, plan });

    await runner.record();
    const dispatched = reobserveAfterAction ? 1 : 2;

    expect(driver.perform).toHaveBeenCalledTimes(dispatched);
    expect(planner.plan.mock.calls[1][0].completedSteps).toHaveLength(dispatched);
    expect(planner.plan.mock.calls[1][0].completedObservations).toEqual(
      Array.from({ length: dispatched }, () => planner.plan.mock.calls[0][0].observation),
    );
    expect(driver.observe).toHaveBeenCalledTimes(2);
  },
);

it('discards remaining batch actions when the session revision changes', async () => {
  const driver = session();

  driver.executionPolicy.reobserveAfterAction = false;
  driver.perform.mockImplementation(async () => {
    await driver.observe();
  });
  const planner = {
    plan: vi
      .fn()
      .mockResolvedValueOnce({
        done: false,
        steps: ['first', 'stale'].map((value) => ({
          platform: 'ios',
          action: { type: 'tap', target: { kind: 'identifier', value } },
        })),
      })
      .mockResolvedValueOnce({ done: true, steps: [] }),
  };

  await new PlanRunner({ evaluator, session: driver, planner, signal, plan }).record();
  expect(driver.perform).toHaveBeenCalledOnce();
  expect(planner.plan.mock.calls[1][0].completedSteps).toHaveLength(1);
});

it('lets the session reject replay before any observation, check or action is dispatched', async () => {
  const driver = session();

  driver.prepareReplayStep.mockRejectedValue(new Error('Replay locator is unstable'));
  const planner = { plan: vi.fn() };
  const runner = new PlanRunner({ evaluator, session: driver, planner, signal, plan });

  await expect(
    runner.replay([
      {
        surfaceId: 'app',
        event: {
          kind: 'action',
          title: 'Submit',
          action: {
            platform: 'ios',
            action: { type: 'tap', target: { kind: 'identifier', value: 'submit' } },
          },
        },
      },
    ]),
  ).rejects.toThrow('Replay locator is unstable');
  expect(driver.observe).not.toHaveBeenCalled();
  expect(driver.perform).not.toHaveBeenCalled();
  expect(planner.plan).not.toHaveBeenCalled();
  expect(evaluator.evaluate).not.toHaveBeenCalled();
});

it('uses an injected evaluator to select a branch and validate its semantic assertion', async () => {
  const driver = session();
  const injected = {
    evaluate: vi
      .fn()
      .mockResolvedValueOnce({ passed: false, evidence: 'No account' })
      .mockResolvedValueOnce({ passed: true, evidence: 'Registration offered' }),
  };
  const planner = { plan: vi.fn<ActionPlanner['plan']>(async () => ({ done: true, steps: [] })) };
  const assertion = { description: 'Registration offered' };
  const branchPlan = {
    rootId: 'branch',
    nodes: {
      branch: {
        id: 'branch',
        kind: 'branch' as const,
        condition: 'Account exists',
        then: 'existing',
        otherwise: 'new',
        dependsOn: [],
      },
      existing: { ...plan.nodes.task, id: 'existing', goal: 'Login' },
      new: { ...plan.nodes.task, id: 'new', goal: 'Register', assertions: [assertion] },
    },
  };

  await new PlanRunner({
    evaluator: injected,
    session: driver,
    planner,
    signal,
    plan: branchPlan,
  }).record();
  expect(planner.plan).toHaveBeenCalledOnce();
  expect(planner.plan.mock.calls[0][0]).toMatchObject({ goal: 'Register' });
  expect(injected.evaluate.mock.calls[0][0]).toMatchObject({
    subject: { condition: 'Account exists' },
    name: 'branch_result',
    signal,
    observation: { sessionId: driver.id },
  });
  expect(injected.evaluate.mock.calls[1][0]).toMatchObject({
    subject: { assertion },
    name: 'assertion_result',
  });
});

it('stops replay when the injected evaluator disagrees with the recorded branch', async () => {
  const driver = session();
  const injected = {
    evaluate: vi.fn(async () => ({ passed: false, evidence: 'Condition changed' })),
  };
  const planner = { plan: vi.fn() };
  const runner = new PlanRunner({ evaluator: injected, session: driver, planner, signal, plan });

  await expect(
    runner.replay([
      {
        event: {
          kind: 'branch',
          title: 'Account exists',
          condition: 'Account exists',
          decision: true,
        },
      },
    ]),
  ).rejects.toThrow('Condition changed');
  expect(driver.perform).not.toHaveBeenCalled();
  expect(planner.plan).not.toHaveBeenCalled();
  expect(driver.emit).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'error' }));
});

it('executes standalone assertions and screenshot steps without asking the action planner', async () => {
  const driver = session();

  driver.capabilities.actions.push('screenshot');
  const planner = {
    plan: vi.fn(async () => {
      throw new Error('action planning forbidden');
    }),
  };
  const authored = {
    rootId: 'root',
    nodes: {
      root: {
        id: 'root',
        kind: 'group' as const,
        goal: '验证',
        children: ['check', 'capture'],
        dependsOn: [],
      },
      check: {
        id: 'check',
        kind: 'task' as const,
        actionType: 'assert' as const,
        goal: '欢迎页面可见',
        dependsOn: [],
        requirementIds: [],
        assertions: [{ description: '欢迎页面可见' }],
      },
      capture: {
        id: 'capture',
        kind: 'task' as const,
        actionType: 'screenshot' as const,
        goal: '截取当前页面',
        dependsOn: [],
        requirementIds: [],
        assertions: [],
      },
    },
  };
  const runner = new PlanRunner({ plan: authored, evaluator, planner, session: driver, signal });

  await runner.record();
  expect(planner.plan).not.toHaveBeenCalled();
  expect(evaluator.evaluate).toHaveBeenCalledOnce();
  expect(driver.perform).toHaveBeenCalledWith(
    { platform: 'ios', action: { type: 'screenshot' } },
    signal,
  );
  const events = driver.emit.mock.calls.map(([event]) => event);

  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ planNodeId: 'check', kind: 'assertion', phase: 'finish' }),
      expect.objectContaining({
        planNodeId: 'capture',
        action: { platform: 'ios', action: { type: 'screenshot' } },
        phase: 'finish',
      }),
    ]),
  );
  await runner.replay([
    {
      event: {
        kind: 'action',
        title: 'screenshot',
        action: { platform: 'ios', action: { type: 'screenshot' } },
      },
    },
  ]);
  expect(planner.plan).not.toHaveBeenCalled();
  expect(driver.perform).toHaveBeenCalledTimes(2);
});

it('executes Navigate directly once, associates it with the node, and keeps subsequent tasks in order', async () => {
  const driver = session();
  const webSession = {
    ...driver,
    platform: 'web' as const,
    get revision() {
      return driver.revision;
    },
    observe: async () => {
      const observation = await driver.observe();

      return { ...observation, surface: { platform: 'web' as const, id: 'page' } };
    },
    capabilities: { actions: ['navigate'], artifacts: [], assertions: [] },
  };
  const planner = { plan: vi.fn().mockResolvedValue({ done: true, steps: [] }) };
  const navigationPlan = {
    rootId: 'root',
    nodes: {
      ...plan.nodes,
      root: {
        id: 'root',
        kind: 'group' as const,
        goal: '测试导航',
        children: ['open', 'task'],
        dependsOn: [],
      },
      open: {
        ...plan.nodes.task,
        id: 'open',
        actionType: 'navigate' as const,
        goal: 'https://example.com/path',
      },
    },
  };

  await new PlanRunner({
    evaluator,
    session: webSession,
    planner,
    signal,
    plan: navigationPlan,
  }).record();

  expect(driver.perform).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      platform: 'web',
      action: expect.objectContaining({ type: 'navigate', value: 'https://example.com/path' }),
    }),
    signal,
  );
  expect(planner.plan).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ goal: 'Submit' }));
  expect(driver.perform.mock.invocationCallOrder[0]).toBeLessThan(
    planner.plan.mock.invocationCallOrder[0],
  );
  expect(driver.emit).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'navigate',
      phase: 'finish',
      planNodeId: 'open',
    }),
  );
});

it('rejects Navigate in a native plan before dispatching browser actions', async () => {
  const driver = session();

  await expect(
    new PlanRunner({
      evaluator,
      session: driver,
      planner: { plan: vi.fn() },
      signal,
      plan: {
        ...plan,
        nodes: {
          task: { ...plan.nodes.task, actionType: 'navigate', goal: 'https://example.com' },
        },
      },
    }).record(),
  ).rejects.toThrow('Navigate 步骤仅支持 Web 测试');
  expect(driver.perform).not.toHaveBeenCalled();
});

it.each([true, false])(
  'rejects branch replay without a recorded decision when evaluation is %s',
  async (passed) => {
    const driver = session();
    const injected = {
      evaluate: vi.fn(async () => ({
        passed,
        evidence: 'Missing recorded decision',
        modelCallId: 'branch-check',
      })),
    };
    const runner = new PlanRunner({
      evaluator: injected,
      session: driver,
      planner: { plan: vi.fn() },
      signal,
      plan,
    });

    await expect(
      runner.replay([
        { event: { kind: 'branch', title: 'Account exists', condition: 'Account exists' } },
      ]),
    ).rejects.toThrow('Missing recorded decision');
    expect(driver.emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'error', modelCallId: 'branch-check' }),
    );
  },
);

it('accepts a replayed branch when both recorded and current decisions are false', async () => {
  const driver = session();
  const injected = { evaluate: vi.fn(async () => ({ passed: false, evidence: 'No account' })) };
  const runner = new PlanRunner({
    evaluator: injected,
    session: driver,
    planner: { plan: vi.fn() },
    signal,
    plan,
  });

  await runner.replay([
    {
      event: {
        kind: 'branch',
        title: 'Account exists',
        condition: 'Account exists',
        decision: false,
      },
    },
  ]);
  expect(driver.emit).toHaveBeenLastCalledWith(
    expect.objectContaining({ phase: 'finish', decision: false }),
  );
});
