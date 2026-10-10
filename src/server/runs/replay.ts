import type { ReplayStep } from '@/automation/platform/contracts';
import {
  normalizeLegacyWebAction,
  normalizePlaywrightAssertion,
} from '@/automation/platform/web/replay';
import type { ExecutionStep } from '@/features/runs/types';

export function normalizeReplaySteps(steps: ExecutionStep[]): ReplayStep[] {
  return steps.map((step) => {
    const action =
      step.platformAction ?? (step.action ? normalizeLegacyWebAction(step.action) : undefined);

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
