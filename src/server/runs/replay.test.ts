import { expect, it } from 'vitest';
import { normalizeReplaySteps } from './replay';
import type { ExecutionStep, PlaywrightAssertion } from '@/features/runs/types';

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

it('normalizes legacy actions without changing recorded metadata or sensitive input placeholders', () => {
  const recorded = step({
    planNodeId: 'login',
    action: {
      type: 'fill',
      target: { kind: 'testId', value: 'password', name: '' },
      value: '${secret:PASSWORD}',
      sensitive: true,
    },
  });
  const before = structuredClone(recorded);
  const [normalized] = normalizeReplaySteps([recorded]);

  expect(normalized).toMatchObject({
    surfaceId: 'page-1',
    event: { planNodeId: 'login', action: { platform: 'web', action: recorded.action } },
  });
  expect(recorded).toEqual(before);
});

it.each([
  ['toBeVisible', 'visible'],
  ['toHaveText', 'text'],
  ['toContainText', 'containsText'],
  ['toHaveValue', 'value'],
  ['toHaveURL', 'url'],
] as const)('normalizes %s while preserving legacy assertion evidence metadata', (type, mapped) => {
  const legacy: PlaywrightAssertion = {
    type,
    target: type === 'toHaveURL' ? undefined : { kind: 'testId', value: 'welcome', name: '' },
    value: 'Welcome Ada',
    negate: true,
  };
  const [normalized] = normalizeReplaySteps([
    step({ kind: 'assertion', playwrightAssertion: legacy }),
  ]);

  expect(normalized.event.platformAssertion).toMatchObject({
    platform: 'web',
    type: mapped,
    value: legacy.value,
    negate: true,
  });
  expect(normalized.event.playwrightAssertion).toEqual(legacy);
});

it('preserves modern native actions and prefers the recorded surface over a legacy page ID', () => {
  const action = {
    platform: 'ios' as const,
    action: { type: 'tap' as const, target: { kind: 'identifier' as const, value: 'submit' } },
  };
  const [normalized] = normalizeReplaySteps([
    step({ platformAction: action, surface: { id: 'native-app', platform: 'ios' } }),
  ]);

  expect(normalized).toMatchObject({ surfaceId: 'native-app', event: { action } });
});

it('preserves semantic checks and the recorded branch outcome for replay verification', () => {
  const [normalized] = normalizeReplaySteps([
    step({ kind: 'branch', condition: 'Account exists', decision: false }),
  ]);

  expect(normalized.event).toMatchObject({ condition: 'Account exists', decision: false });
});
