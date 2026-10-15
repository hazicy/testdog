import { expect, it } from 'vitest';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import { TestTargetSchema } from '@testdog/contracts/automation/platform/target';
import { caseTarget, initialCaseSettings } from './caseSettings';

it('round-trips a custom Web UA through saved case settings', () => {
  const settings = { ...initialCaseSettings(), userAgent: '  Caseforge-Test/1.0  ' };
  const target = TestTargetSchema.parse(caseTarget(settings));
  const saved: TestCase = {
    id: 'ua-case',
    name: 'UA',
    goal: 'Check UA',
    url: '',
    target,
    tags: [],
    createdAt: '',
    updatedAt: '',
  };

  expect(target).toMatchObject({ userAgent: 'Caseforge-Test/1.0' });
  expect(initialCaseSettings(saved).userAgent).toBe('Caseforge-Test/1.0');
});

it('omits empty UA overrides and keeps custom UA out of native targets', () => {
  const settings = initialCaseSettings();

  expect(caseTarget(settings)).not.toHaveProperty('userAgent');
  expect(caseTarget({ ...settings, userAgent: '  ' })).not.toHaveProperty('userAgent');
  expect(caseTarget({ ...settings, platform: 'android', userAgent: 'Custom' })).not.toHaveProperty(
    'userAgent',
  );
});
