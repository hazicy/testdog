import { expect, it } from 'vitest';
import { normalizeReplaySteps } from '@testdog/server/runs/replay';
import type { ExecutionStep } from '@testdog/contracts/runs/types';
import type { PlatformAssertion } from '@testdog/contracts/automation/platform/contracts';

function step(fields: Partial<ExecutionStep>): ExecutionStep {
  return {
    id: 'step',
    runId: 'run',
    sequence: 0,
    kind: 'action',
    title: 'Recorded step',
    status: 'passed',
    startedAt: '2026-10-10T00:00:00.000Z',
    pageId: 'page-1',
    pageUrl: '',
    replayable: true,
    ...fields,
  };
}

it('passes canonical actions without changing recorded metadata or sensitive input placeholders', () => {
  const recorded = step({
    planNodeId: 'login',
    action: {
      platform: 'web',
      action: {
        type: 'fill',
        target: { kind: 'testId', value: 'password', name: '' },
        value: '${secret:PASSWORD}',
        sensitive: true,
      },
    },
  });
  const before = structuredClone(recorded);
  const [normalized] = normalizeReplaySteps([recorded]);

  expect(normalized).toMatchObject({
    surfaceId: 'page-1',
    event: { planNodeId: 'login', action: recorded.action },
  });
  expect(recorded).toEqual(before);
});

it.each(['visible', 'text', 'containsText', 'value', 'url'] as const)(
  'passes canonical %s assertions unchanged',
  (type) => {
    const assertion: PlatformAssertion = {
      platform: 'web',
      type,
      target: type === 'url' ? undefined : { kind: 'testId', value: 'welcome', name: '' },
      value: 'Welcome Ada',
      negate: true,
    };
    const [normalized] = normalizeReplaySteps([
      step({ kind: 'assertion', platformAssertion: assertion }),
    ]);

    expect(normalized.event.platformAssertion).toBe(assertion);
  },
);

it('preserves modern native actions and prefers the recorded surface over a legacy page ID', () => {
  const action = {
    platform: 'ios' as const,
    action: { type: 'tap' as const, target: { kind: 'identifier' as const, value: 'submit' } },
  };
  const [normalized] = normalizeReplaySteps([
    step({ action, surface: { id: 'native-app', platform: 'ios' } }),
  ]);

  expect(normalized).toMatchObject({ surfaceId: 'native-app', event: { action } });
});

it('preserves semantic checks and the recorded branch outcome for replay verification', () => {
  const [normalized] = normalizeReplaySteps([
    step({ kind: 'branch', condition: 'Account exists', decision: false }),
  ]);

  expect(normalized.event).toMatchObject({ condition: 'Account exists', decision: false });
});
