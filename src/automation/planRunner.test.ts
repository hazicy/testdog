import { expect, it, vi } from 'vitest';
import type { AutomationSession, Observation, SessionEvent } from './platform/contracts';
import type { ExecutionStep } from '@/workspace/types';
import { PlanRunner } from './planRunner';
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
function session() {
  let revision = 0;
  return {
    id: 'device',
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
it('never invokes action planning when replaying a deterministic platform check', async () => {
  const driver = session();
  const planner = {
    plan: vi.fn(async () => {
      throw new Error('replanning forbidden');
    }),
  };
  const runner = new PlanRunner({ session: driver, planner, signal, plan });
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
  await runner.replay([step]);
  expect(planner.plan).not.toHaveBeenCalled();
  expect(driver.check).toHaveBeenCalledOnce();
  driver.check.mockResolvedValue({ passed: false, evidence: 'Missing welcome label' });
  await expect(runner.replay([step])).rejects.toThrow('Missing welcome');
});
it('retains the command failure and evidence failure when error capture also fails', async () => {
  const driver = session();
  driver.perform.mockRejectedValue(new Error('device disconnected'));
  driver.emit.mockImplementation(async (event) => {
    if (event.phase === 'error') throw new Error('snapshot unavailable');
  });
  const runner = new PlanRunner({ session: driver, signal, plan, planner: { plan: vi.fn() } });
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
