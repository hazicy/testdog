import type { BrowserLog, ExecutionStep, RunArtifact, TestRun } from '@/features/runs/types';

export type Preview = { version: string; capturedAt: string; contentType: string };
export type RunUpdate =
  | { kind: 'run'; revision: number; data: Partial<TestRun> }
  | { kind: 'step'; revision: number; data: ExecutionStep }
  | { kind: 'artifact'; revision: number; data: RunArtifact }
  | { kind: 'logs'; revision: number; data?: undefined }
  | { kind: 'log'; revision: number; data: BrowserLog };

export function applyRunUpdates(run: TestRun, updates: RunUpdate[]): TestRun {
  let next = run;

  for (const update of updates) {
    if (update.revision <= (next.realtimeRevision ?? 0)) continue;
    if (update.kind === 'run') next = { ...next, ...update.data };
    else if (update.kind === 'step') {
      const steps = next.steps.filter((step) => step.id !== update.data.id);

      steps.push(update.data);
      next = { ...next, steps: steps.sort((a, b) => a.sequence - b.sequence) };
    } else if (update.kind === 'artifact') {
      if (!next.artifacts.some((artifact) => artifact.id === update.data.id))
        next = { ...next, artifacts: [...next.artifacts, update.data] };
    } else if (update.kind === 'logs') next = { ...next, browserLogRevision: update.revision };
    else if (!next.browserLogs?.some((log) => log.id === update.data.id))
      next = { ...next, browserLogs: [...(next.browserLogs ?? []), update.data] };
    next = { ...next, realtimeRevision: update.revision };
  }

  return next;
}
