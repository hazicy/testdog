import type { RecordingOperation } from '@testdog/contracts/runs/types';

/** Freeze only the operation fields of an executed step for replay. */
export function recordingOperation(step: RecordingOperation): RecordingOperation {
  return {
    kind: step.kind,
    title: step.title,
    pageId: step.pageId,
    surface: step.surface,
    planNodeId: step.planNodeId,
    action: step.action,
    platformAction: step.platformAction,
    assertion: step.assertion,
    platformAssertion: step.platformAssertion,
    playwrightAssertion: step.playwrightAssertion,
    condition: step.condition,
    decision: step.decision,
  };
}
