import { expect, it } from 'vitest';
import type { OccurrenceSnapshot } from '@testdog/contracts/issues/types';
import { actualResult } from './actualResult';

const snapshot: OccurrenceSnapshot = { name: '订单', goal: '金额为100', url: '', artifacts: [] };
const step = {
  id: 'step',
  runId: 'run',
  sequence: 1,
  kind: 'assertion' as const,
  title: '检查金额',
  assertion: { description: '金额为100' },
  status: 'failed' as const,
  startedAt: '2026-10-01T00:00:00Z',
  pageId: 'page',
  pageUrl: '',
  replayable: false,
};

it('prioritizes concrete evidence and retains a distinct failure for inspection', () => {
  expect(
    actualResult({
      ...snapshot,
      step: { ...step, evidence: '订单详情显示 ¥120.00', error: '检查失败' },
      error: '检查失败',
    }),
  ).toEqual({
    summary: '订单详情显示 ¥120.00',
    details: '订单详情显示 ¥120.00\n\n检查失败',
  });
});

it.each(['', '   ', '金额为100'])(
  'falls back to the failure when evidence is empty or only repeats the expectation (%s)',
  (evidence) => {
    expect(
      actualResult({ ...snapshot, step: { ...step, evidence, error: '订单详情未加载' } }),
    ).toEqual({ summary: '订单详情未加载', details: undefined });
  },
);

it('extracts the received value while preserving complete Playwright diagnostics', () => {
  const error =
    'Error: expect(locator).toHaveText(expected) failed\n\nExpected: "100"\nReceived: "120"\n\nCall log:\n  - waiting for locator(".amount")';

  expect(actualResult({ ...snapshot, error })).toEqual({
    summary: 'Received: "120"',
    receivedValue: '"120"',
    details: error,
  });
});

it('keeps application error messages and makes stack traces secondary', () => {
  const error = 'Error: Payment service unavailable\n    at submit (checkout.js:10:2)';

  expect(actualResult({ ...snapshot, error })).toEqual({
    summary: 'Payment service unavailable',
    details: error,
  });
});

it('does not invent an actual result when there is no evidence or error', () => {
  expect(actualResult(snapshot)).toBeUndefined();
  expect(actualResult({ ...snapshot, step: { ...step, evidence: '金额为100' } })).toBeUndefined();
});

it('keeps concrete evidence even when it is also the step title', () => {
  expect(
    actualResult({ ...snapshot, step: { ...step, title: '页面显示120', evidence: '页面显示120' } }),
  ).toEqual({ summary: '页面显示120', details: undefined });
});
