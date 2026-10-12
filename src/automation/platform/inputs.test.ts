import { afterEach, expect, test, vi } from 'vitest';
import { inputGoal, InputRefsSchema, SecretInputs } from './inputs';

afterEach(() => vi.unstubAllEnvs());
test('stored passwords resolve and redact without worker environment configuration', () => {
  vi.stubEnv('CASEFORGE_SECRET_STORED_PASSWORD', '');
  const secrets = new SecretInputs(
    { password: { secretRef: 'STORED_PASSWORD' } },
    { STORED_PASSWORD: 'ui-password' },
  );

  expect(secrets.resolve('${secret:STORED_PASSWORD}')).toEqual({
    value: 'ui-password',
    sensitive: true,
  });
  expect(secrets.redact('ui-password')).toBe('[redacted]');
});
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
  expect(() => inputGoal('${input.missing}')).toThrow('缺少输入引用');
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
