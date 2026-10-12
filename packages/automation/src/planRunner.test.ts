import { normalizeReplaySteps } from '@testdog/server/runs/replay';
import { beforeEach, expect, it, vi } from 'vitest';
import type {
  ActionPlanner,
  AutomationSession,
  Observation,
  SessionEvent,
} from '@testdog/contracts/automation/platform/contracts';
import type { ExecutionStep } from '@testdog/contracts/runs/types';
import { PlanRunner } from '@testdog/automation/planRunner';

const evaluator = { evaluate: vi.fn(async () => ({ passed: true, evidence: 'Verified' })) };

beforeEach(() => vi.clearAllMocks());

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
    perform: vi.fn(async () => {}),
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
