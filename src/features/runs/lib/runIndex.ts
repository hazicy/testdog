import type { RunArtifact, TestRun } from '@/features/runs/types';

type FramePositions = { first: number; before?: number; after?: number };

export function indexRun(run?: Pick<TestRun, 'steps' | 'artifacts'>) {
  const frames: RunArtifact[] = [];
  const videos: RunArtifact[] = [];
  const stepFrames = new Map<string, FramePositions>();
  let trace: RunArtifact | undefined;
  for (const artifact of run?.artifacts || []) {
    if (artifact.kind === 'video') videos.push(artifact);
    else if (artifact.kind === 'trace') trace ??= artifact;
    else {
      const index = frames.length;

      frames.push(artifact);
      if (!artifact.stepId) continue;
      const positions: FramePositions = stepFrames.get(artifact.stepId) || { first: index };
      if (artifact.stage === 'before' || artifact.stage === 'after')
        positions[artifact.stage] ??= index;
      stepFrames.set(artifact.stepId, positions);
    }
  }
  const steps = new Map((run?.steps || []).map((step) => [step.id, step]));

  return { frames, videos, trace, stepFrames, steps };
}
