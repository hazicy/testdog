import type { ReplayStep } from '@testdog/contracts/automation/platform/contracts';
import { normalizePlaywrightAssertion } from '@testdog/automation/platform/web/replay';
import type { ExecutionStep } from '@testdog/contracts/runs/types';

export function normalizeReplaySteps(steps: ExecutionStep[]): ReplayStep[] {
  return steps.map((step) => {
    const action: ReplayStep['event']['action'] =
      step.platformAction ?? (step.action ? { platform: 'web', action: step.action } : undefined);

    return {
      surfaceId: step.surface?.id ?? step.pageId,
      event: {
        planNodeId: step.planNodeId,
        kind: step.kind,
        title: step.title,
        action,
        platformAssertion:
          !action && step.playwrightAssertion
            ? normalizePlaywrightAssertion(step.playwrightAssertion)
            : step.platformAssertion,
        playwrightAssertion: step.playwrightAssertion,
        assertion: step.assertion,
        condition: step.condition,
        decision: step.decision,
      },
    };
  });
}
