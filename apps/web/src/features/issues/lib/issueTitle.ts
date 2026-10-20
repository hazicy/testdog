import type { ExecutionStep, TestRun } from '@testdog/contracts/runs/types';
import { actualResult } from './actualResult';

export function issueTitle(run?: TestRun, step?: ExecutionStep) {
  if (!run) return '';

  const failedSteps = run.steps.filter((item) => item.status === 'failed');
  const sourceStep = step ?? (failedSteps.length === 1 ? failedSteps[0] : undefined);
  const result = actualResult({
    name: run.name,
    goal: run.goal,
    url: run.url,
    artifacts: [],
    step: sourceStep,
    error: step ? step.error : run.error,
  });

  return result?.summary.split('\n')[0].trim().slice(0, 200) ?? '';
}
