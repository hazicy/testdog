import { expect, test } from 'vitest';
import { emptyRunCounts } from '@testdog/contracts/workspace/types';
import { suiteRunStatus } from './types';

test.each([
  [{ queued: 2 }, 'queued'],
  [{ queued: 1, passed: 1 }, 'running'],
  [{ failed: 1, running: 1 }, 'running'],
  [{ passed: 2 }, 'passed'],
  [{ passed: 1, failed: 1, cancelled: 1 }, 'failed'],
  [{ passed: 1, cancelled: 1 }, 'cancelled'],
] as const)('summarizes a batch %j as %s', (counts, expected) => {
  expect(suiteRunStatus({ ...emptyRunCounts(), ...counts })).toBe(expected);
});
