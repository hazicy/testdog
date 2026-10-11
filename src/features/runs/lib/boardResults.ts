import type { PlanNode } from '@/automation/compiler/schema';
import type { ExecutionStep, RunArtifact, TestRun } from '../types';

/** Legacy plans identify attached assertions by text; use occurrence order for duplicates. */
export function boardNodeSteps(node: PlanNode, steps: ExecutionStep[], assertionIndex?: number) {
  const associated = steps.filter((step) => step.planNodeId === node.id);

  if (node.kind !== 'task' || node.actionType === 'assert') return associated;
  if (assertionIndex === undefined)
    return associated.filter((step) => !node.assertions.length || step.kind !== 'assertion');
  const description = node.assertions[assertionIndex]?.description;
  const occurrence = node.assertions
    .slice(0, assertionIndex)
    .filter((assertion) => assertion.description === description).length;
  const matching = associated.filter(
    (step) => step.kind === 'assertion' && step.assertion?.description === description,
  );

  return matching.slice(occurrence, occurrence + 1);
}

export function boardResult(steps: ExecutionStep[], artifacts: RunArtifact[]) {
  const failed = steps.find((step) => step.status === 'failed');
  const running = steps.find((step) => step.status === 'running');
  const primary = failed ?? running ?? steps.at(-1);
  const status = failed ? 'failed' : running ? 'running' : steps.length ? 'passed' : 'none';
  const ids = new Set(steps.map((step) => step.id));
  const frames = artifacts.filter(
    (artifact) => artifact.kind === 'screenshot' && artifact.stepId && ids.has(artifact.stepId),
  );
  const primaryFrames = frames.filter((frame) => frame.stepId === primary?.id);
  const frame =
    primaryFrames.findLast((item) => item.stage === 'after') ??
    primaryFrames.at(-1) ??
    frames.at(-1);
  const durationMs = steps.every((step) => step.durationMs !== undefined)
    ? steps.reduce((total, step) => total + step.durationMs!, 0)
    : undefined;

  return { status, primary, frame, durationMs };
}

/** Timeline highlighting follows step timestamps, even when there are no screenshots. */
export function stepAtTime(run: Pick<TestRun, 'startedAt' | 'steps'>, elapsedMs: number) {
  const at = Date.parse(run.startedAt) + elapsedMs;

  return run.steps.findLast((step) => Date.parse(step.startedAt) <= at);
}
