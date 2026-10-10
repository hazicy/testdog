import { afterEach, expect, test, vi } from 'vitest';
import { inputGoal, InputRefsSchema, SecretInputs } from './inputs';
afterEach(() => vi.unstubAllEnvs());
test('public inputs resolve while secret values stay outside compiler and recording context', () => {
  const inputs = InputRefsSchema.parse({
    name: { value: 'Ada' },
    password: { secretRef: 'PASSWORD' },
  });
  vi.stubEnv('CASEFORGE_SECRET_PASSWORD', 'never-send-to-model');
  expect(inputGoal('Fill ${input.name} and ${input.password}', inputs)).toBe(
    'Fill Ada and ${secret:PASSWORD}',
  );
  const secrets = new SecretInputs(inputs);
  expect(secrets.resolve('${secret:PASSWORD}')).toEqual({
    value: 'never-send-to-model',
    sensitive: true,
  });
  expect(secrets.redact('error never-send-to-model')).toBe('error [redacted]');
  expect(() => secrets.resolve('prefix ${secret:PASSWORD}')).toThrow('entire fill');
  expect(() => secrets.resolve('${secret:UNREGISTERED}')).toThrow('Unregistered');
});
test('missing references and worker credentials fail without dispatching a value', () => {
  vi.stubEnv('CASEFORGE_SECRET_PASSWORD', '');
  expect(() => inputGoal('${input.missing}')).toThrow('Missing input');
  expect(() => new SecretInputs({ password: { secretRef: 'PASSWORD' } })).toThrow(
    'Missing worker secret',
  );
  expect(InputRefsSchema.safeParse({ password: { secretRef: '../PASSWORD' } }).success).toBe(false);
});
test('escaped and URL-encoded secrets are redacted without corrupting JSON', () => {
  vi.stubEnv('CASEFORGE_SECRET_PASSWORD', 'p"a\nss');
  const secrets = new SecretInputs({ password: { secretRef: 'PASSWORD' } });
  expect(JSON.parse(secrets.redact(JSON.stringify({ error: 'p"a\nss' })))).toEqual({
    error: '[redacted]',
  });
  expect(secrets.redact(encodeURIComponent('p"a\nss'))).toBe('[redacted]');
});
