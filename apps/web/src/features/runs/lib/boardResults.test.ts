import { expect, it } from 'vitest';
import type { PlanNode } from '@testdog/contracts/automation/compiler/schema';
import type { ExecutionStep, RunArtifact } from '@testdog/contracts/runs/types';
import { boardNodeSteps, boardResult, stepAtTime } from '@/features/runs/lib/boardResults';
import { layoutPlan } from '@/features/runs/lib/planLayout';

const step: ExecutionStep = {
  id: 'step',
  runId: 'run',
  sequence: 1,
  kind: 'assertion',
  title: '金额正确',
  planNodeId: 'task',
  status: 'failed',
  startedAt: '2026-10-01T00:00:02Z',
  durationMs: 1000,
  pageId: 'page',
  pageUrl: 'https://example.com',
  replayable: true,
  assertion: { description: '金额正确' },
  error: '实际金额为 120',
};
const node: PlanNode = {
  id: 'task',
  kind: 'task',
  goal: '提交订单',
  dependsOn: [],
  requirementIds: [],
  assertions: [{ description: '金额正确' }, { description: '金额正确' }],
};
const frame: RunArtifact = {
  id: 'frame',
  runId: 'run',
  stepId: step.id,
  kind: 'screenshot',
  stage: 'after',
  capturedAt: step.startedAt,
  elapsedMs: 3000,
  pageId: 'page',
  pageUrl: step.pageUrl,
  contentType: 'image/png',
  size: 1,
};

it('keeps repeated assertion descriptions associated with their own execution', () => {
  const second = { ...step, id: 'second', sequence: 2, status: 'passed' as const };

  expect(boardNodeSteps(node, [step, second], 0)).toEqual([step]);
  expect(boardNodeSteps(node, [step, second], 1)).toEqual([second]);
  expect(boardNodeSteps(node, [step, second])).toEqual([]);
  expect(boardNodeSteps(node, [step], 1)).toEqual([]);
});

it('prefers the failed step and its evidence over later successful steps', () => {
  const later = { ...step, id: 'later', status: 'passed' as const };
  const result = boardResult(
    [step, later],
    [frame, { ...frame, id: 'later-frame', stepId: later.id }],
  );

  expect(result.status).toBe('failed');
  expect(result.primary).toBe(step);
  expect(result.frame).toBe(frame);
  expect(result.durationMs).toBe(2000);
  expect(boardResult([{ ...step, durationMs: undefined }], []).durationMs).toBeUndefined();
});

it('supports incomplete evidence without attributing another step screenshot', () => {
  expect(boardResult([step], [{ ...frame, stepId: 'other' }]).frame).toBeUndefined();
  expect(boardResult([step], [{ ...frame, stage: 'before' }]).frame?.stage).toBe('before');
  expect(boardResult([], []).status).toBe('none');
  expect(boardResult([{ ...step, status: 'running' }], []).status).toBe('running');
});

it('finds the timeline step from timestamps without requiring captured frames', () => {
  const run = {
    startedAt: '2026-10-01T00:00:00Z',
    steps: [step, { ...step, id: 'next', startedAt: '2026-10-01T00:00:05Z' }],
  };

  expect(stepAtTime(run, 1000)).toBeUndefined();
  expect(stepAtTime(run, 2000)?.id).toBe('step');
  expect(stepAtTime(run, 6000)?.id).toBe('next');
});

it('reserves result space without overlapping following assertion nodes', () => {
  const plan = { rootId: node.id, nodes: { [node.id]: node } };
  const authoring = layoutPlan(plan);
  const results = layoutPlan(plan, true);

  expect(results.nodes[0].height).toBe(authoring.nodes[0].height + 190);
  for (let index = 1; index < results.nodes.length; index++) {
    const previous = results.nodes[index - 1];

    expect(results.nodes[index].position.y).toBeGreaterThan(previous.position.y + previous.height);
  }
});
