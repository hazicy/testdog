import type { Plan } from '@testdog/contracts/execution/plan';
import type { ExecutionStep, RunArtifact, TestRun } from '@testdog/contracts/runs/types';
import { previewFrameUrl } from './previewFrames';

const stepDurationMs = 2000;
const startedAt = '2026-01-01T00:00:00Z';
const actionTypes = ['navigate', 'act', 'act', 'assert'] as const;

type LoginContent = {
  name: string;
  url: string;
  input: [string, string, string, string];
  title: string;
  subtitle: string;
};

/** Build one local fixture for the editor, execution list, and replay timeline. */
export function createLoginExample(content: LoginContent) {
  const ids = content.input.map((_, index) => `step-${index}`);
  const plan: Plan = {
    rootId: 'root',
    nodes: {
      root: { id: 'root', kind: 'group', goal: content.name, children: ids, dependsOn: [] },
    },
  };

  content.input.forEach((goal, index) => {
    const actionType = actionTypes[index];

    plan.nodes[ids[index]] = {
      id: ids[index],
      kind: 'task',
      goal: actionType === 'navigate' ? `https://${content.url}` : goal,
      actionType,
      dependsOn: index ? [ids[index - 1]] : [],
      requirementIds: [],
      assertions: actionType === 'assert' ? [{ description: goal }] : [],
    };
  });
  const steps: ExecutionStep[] = content.input.map((goal, index) => {
    const actionType = actionTypes[index];

    return {
      id: ids[index],
      planNodeId: ids[index],
      runId: 'landing-example',
      sequence: index + 1,
      kind:
        actionType === 'navigate' ? 'navigate' : actionType === 'assert' ? 'assertion' : 'action',
      title: goal,
      status: 'passed',
      startedAt: new Date(Date.parse(startedAt) + index * stepDurationMs).toISOString(),
      durationMs: stepDurationMs,
      pageId: 'page-1',
      pageUrl: `https://${content.url}`,
      replayable: true,
    };
  });
  const frames: RunArtifact[] = steps.map((step, index) => ({
    id: `frame-${index}`,
    runId: step.runId,
    stepId: step.id,
    kind: 'screenshot',
    stage: 'after',
    pageId: step.pageId,
    pageUrl: step.pageUrl,
    capturedAt: step.startedAt,
    elapsedMs: index * stepDurationMs,
    contentType: 'image/svg+xml',
    size: 0,
  }));
  const frameSources: Record<string, string> = Object.fromEntries(
    frames.map((frame, index) => [frame.id, previewFrameUrl(content, index)]),
  );
  const run = {
    id: 'landing-example',
    name: content.name,
    url: `https://${content.url}`,
    goal: content.input.join('\n'),
    mode: 'record',
    status: 'passed',
    startedAt,
    durationMs: steps.length * stepDurationMs,
    targetSnapshot: {
      schemaVersion: 1,
      platform: 'web',
      url: `https://${content.url}`,
      browser: 'chromium',
      deviceProfile: 'legacy-desktop',
    },
    events: [],
    plan,
    steps,
    artifacts: frames,
    replayable: true,
    cancelRequested: false,
  } satisfies TestRun;

  return { content, run, frameSources };
}

export type LoginExample = ReturnType<typeof createLoginExample>;
