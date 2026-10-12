import type { ReplayStep } from '@testdog/contracts/automation/platform/contracts';
import type { RecordingOperation } from '@testdog/contracts/runs/types';

export function normalizeReplaySteps(steps: RecordingOperation[]): ReplayStep[] {
  return steps.map((step) => ({
    surfaceId: step.surface?.id ?? step.pageId,
    event: {
      planNodeId: step.planNodeId,
      kind: step.kind,
      title: step.title,
      action: step.action,
      platformAssertion: step.platformAssertion,
      assertion: step.assertion,
      condition: step.condition,
      decision: step.decision,
    },
  }));
}
