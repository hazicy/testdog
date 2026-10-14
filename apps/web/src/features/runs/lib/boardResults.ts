import type { PlanNode } from '@testdog/contracts/automation/compiler/schema';
import type { ExecutionStep, RunArtifact, TestRun } from '@testdog/contracts/runs/types';

export function indexStepsByNode(steps: ExecutionStep[]) {
  const index = new Map<string, ExecutionStep[]>();

  for (const step of steps) {
    if (!step.planNodeId) continue;
    const entries = index.get(step.planNodeId) ?? [];

    entries.push(step);
    index.set(step.planNodeId, entries);
  }

  return index;
}

export function planNodeTitle(node: PlanNode, assertionIndex?: number) {
  if (node.kind === 'branch') return node.condition;
  if (node.kind === 'task' && assertionIndex !== undefined)
    return node.assertions[assertionIndex]?.description ?? '';

  return node.goal;
}

export function stepResult(steps: ExecutionStep[]): {
  primary: ExecutionStep | undefined;
  status: ExecutionStep['status'] | 'none';
} {
  const primary =
    steps.find((step) => step.status === 'failed') ??
    steps.find((step) => step.status === 'running') ??
    steps.at(-1);

  return { primary, status: primary?.status ?? 'none' };
}

/** Attached assertions share a node ID; distinguish repeated descriptions by occurrence. */
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
  const { primary, status } = stepResult(steps);
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
