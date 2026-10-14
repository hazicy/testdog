import { expect, it } from 'vitest';
import { indexRun } from '@/features/runs/lib/runIndex';
import type { RunArtifact } from '@testdog/contracts/runs/types';

function frame(id: string, stage: RunArtifact['stage'], stepId?: string): RunArtifact {
  return {
    id,
    runId: 'run',
    kind: 'screenshot',
    stage,
    stepId,
    pageId: 'page-1',
    pageUrl: 'https://example.com',
    capturedAt: '2026-10-01T00:00:00Z',
    elapsedMs: 0,
    contentType: 'image/jpeg',
    size: 1,
  };
}

it('preserves frame order and chooses the first evidence of each stage per step', () => {
  const artifacts = [
    frame('live', 'live'),
    frame('before', 'before', 'step'),
    { ...frame('video', 'final'), kind: 'video' as const },
    frame('after', 'after', 'step'),
    frame('duplicate-after', 'after', 'step'),
    { ...frame('trace', 'final'), kind: 'trace' as const },
    frame('failed-before', 'before', 'failed-step'),
  ];
  const indexed = indexRun({ steps: [], artifacts });

  expect(indexed.frames.map((artifact) => artifact.id)).toEqual([
    'live',
    'before',
    'after',
    'duplicate-after',
    'failed-before',
  ]);
  expect(indexed.frames[1]).toBe(artifacts[1]);
  expect(indexed.stepFrames.get('step')).toEqual({ first: 1, before: 1, after: 2 });
  expect(indexed.stepFrames.get('failed-step')).toEqual({ first: 4, before: 4 });
  expect(indexed.stepFrames.has('missing')).toBe(false);
  expect(indexed.videos.map((artifact) => artifact.id)).toEqual(['video']);
  expect(indexed.trace?.id).toBe('trace');
  expect(artifacts).toHaveLength(7);
});

it('supports loading executions with no captured evidence yet', () => {
  expect(indexRun().frames).toEqual([]);
  expect(indexRun().steps.size).toBe(0);
  expect(indexRun().trace).toBeUndefined();
});

it('orders screenshots by capture time and excludes videos and traces from frame playback', () => {
  const later = { ...frame('later', 'after', 'step'), elapsedMs: 9000 };
  const earlier = { ...frame('earlier', 'before', 'step'), elapsedMs: 1000 };
  const indexed = indexRun({
    steps: [],
    artifacts: [
      later,
      { ...frame('video', 'final'), kind: 'video', elapsedMs: 20000 },
      { ...frame('trace', 'final'), kind: 'trace' },
      earlier,
    ],
  });

  expect(indexed.frames.map((item) => item.id)).toEqual(['earlier', 'later']);
  expect(indexed.stepFrames.get('step')).toEqual({ first: 0, before: 0, after: 1 });
});
