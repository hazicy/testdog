import { expect, it } from 'vitest';
import type { ExecutionStep, TestRun } from '@testdog/contracts/runs/types';
import { issueTitle } from './issueTitle';

const step: ExecutionStep = {
  id: 'step',
  runId: 'run',
  sequence: 1,
  kind: 'assertion',
  title: '检查金额',
  assertion: { description: '金额为100' },
  status: 'failed',
  startedAt: '2026-10-01T00:00:00Z',
  pageId: 'page',
  pageUrl: '',
  replayable: false,
};
const run = {
  name: '订单测试',
  goal: '金额为100',
  url: '',
  steps: [],
} as unknown as TestRun;

it('uses concrete evidence from the selected step', () => {
  expect(issueTitle(run, { ...step, evidence: '订单详情显示 ¥120.00' })).toBe(
    '订单详情显示 ¥120.00',
  );
});

it('uses the only failed step when creating from a run', () => {
  expect(issueTitle({ ...run, steps: [{ ...step, evidence: '订单详情显示 ¥120.00' }] })).toBe(
    '订单详情显示 ¥120.00',
  );
});

it('does not choose an arbitrary step when several steps failed', () => {
  const failed = { ...step, evidence: '订单详情显示 ¥120.00' };
  expect(issueTitle({ ...run, steps: [failed, { ...failed, id: 'other' }] })).toBe('');
});

it('cleans run errors and keeps the title on one line', () => {
  expect(issueTitle({ ...run, error: 'Error: 订单详情未加载\n更多诊断\n    at submit' })).toBe(
    '订单详情未加载',
  );
});

it('does not use an unrelated run error for a selected step', () => {
  expect(issueTitle({ ...run, error: '其他步骤失败' }, step)).toBe('');
});

it('leaves the title empty without actual evidence', () => {
  expect(issueTitle()).toBe('');
  expect(issueTitle(run)).toBe('');
  expect(issueTitle(run, { ...step, evidence: '金额为100' })).toBe('');
});

it('limits the default title to the input maximum length', () => {
  expect(issueTitle({ ...run, error: '错'.repeat(250) })).toHaveLength(200);
});
