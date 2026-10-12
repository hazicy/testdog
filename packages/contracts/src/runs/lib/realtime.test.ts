import { expect, it } from 'vitest';
import { applyRunUpdates } from '@testdog/contracts/runs/lib/realtime';
import type { TestRun, ExecutionStep } from '@testdog/contracts/runs/types';

it('merges deltas idempotently without replacing evidence or logs on a run update', () => {
  const run = {
    id: 'run',
    realtimeRevision: 1,
    steps: [],
    artifacts: [{ id: 'evidence' }],
    browserLogs: [],
    events: [{ at: '2026-10-11T00:00:00Z', message: 'Started' }],
    status: 'running',
  } as unknown as TestRun;
  const step = { id: 'step', sequence: 1, status: 'running' } as ExecutionStep;
  const updates = [
    { kind: 'step' as const, revision: 2, data: step },
    { kind: 'run' as const, revision: 3, data: { status: 'finalizing' as const } },
    { kind: 'step' as const, revision: 4, data: { ...step, status: 'passed' as const } },
    {
      kind: 'event' as const,
      revision: 5,
      data: { at: '2026-10-11T00:00:01Z', message: 'Completed' },
    },
    { kind: 'run' as const, revision: 6, data: { status: 'passed' as const } },
  ];
  const result = applyRunUpdates(run, updates);

  expect(result.status).toBe('passed');
  expect(result.events).toEqual([
    ...run.events,
    { at: '2026-10-11T00:00:01Z', message: 'Completed' },
  ]);
  expect(result.steps).toEqual([{ ...step, status: 'passed' }]);
  expect(result.artifacts).toEqual(run.artifacts);
  expect(applyRunUpdates(result, updates)).toBe(result);
  expect(run.steps).toEqual([]);
});
