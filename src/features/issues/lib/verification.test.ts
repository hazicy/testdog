import { expect, it } from 'vitest';
import { verificationResult } from './verification';
import type { OccurrenceSnapshot } from '../types';
import type { TestRun, ExecutionStep } from '@/features/runs/types';

const step: ExecutionStep = {
  id: 'step',
  runId: 'run',
  sequence: 1,
  kind: 'assertion',
  title: '金额为100',
  status: 'passed',
  startedAt: '2026-10-01T00:00:00Z',
  pageId: 'page',
  pageUrl: '',
  planNodeId: 'amount',
  assertion: { description: '金额为100' },
  replayable: true,
};
const source: OccurrenceSnapshot = {
  name: '订单',
  goal: '',
  url: '',
  step,
  artifacts: [],
  nodeGoal: '金额为100',
};
const run: TestRun = {
  id: 'run',
  name: '',
  goal: '',
  url: '',
  status: 'passed',
  mode: 'record',
  startedAt: step.startedAt,
  cancelRequested: false,
  replayable: false,
  steps: [step],
  artifacts: [],
  events: [],
};

it('never treats cancellation, missing evidence or missing target as a valid pass', () => {
  expect(verificationResult(source, { ...run, status: 'cancelled' }).outcome).toBe('inconclusive');
  expect(verificationResult(source, { ...run, evidenceComplete: false }).outcome).toBe(
    'inconclusive',
  );
  expect(verificationResult(source, { ...run, steps: [] }).outcome).toBe('inconclusive');
  expect(verificationResult(source, { ...run, status: 'running' }).outcome).toBe('pending');
});

it('distinguishes recurring failure from a passed target and from unrelated failures', () => {
  expect(verificationResult(source, run).outcome).toBe('passed');
  expect(
    verificationResult(source, { ...run, status: 'failed', steps: [{ ...step, status: 'failed' }] })
      .outcome,
  ).toBe('failed');
  expect(verificationResult(source, { ...run, status: 'failed' }).outcome).toBe('inconclusive');
  expect(
    verificationResult(source, {
      ...run,
      steps: [{ ...step, assertion: { description: '金额大于0' } }],
    }).outcome,
  ).toBe('inconclusive');
  expect(verificationResult(source, { ...run, plan: { rootId: 'other', nodes: {} } }).outcome).toBe(
    'inconclusive',
  );
});
