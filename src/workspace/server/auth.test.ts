import { afterEach, expect, test, vi } from 'vitest';
import { workspaceAuthorized } from './auth';
afterEach(() => vi.unstubAllEnvs());
test('configured credentials protect workspace and artifact access', () => {
  vi.stubEnv('CASEFORGE_AUTH_USER', 'operator');
  vi.stubEnv('CASEFORGE_AUTH_PASSWORD', 'secret:with:colons');
  const request = (value?: string) =>
    new Request('http://localhost/api/runs/run/artifacts/artifact', {
      headers: value ? { authorization: value } : {},
    });
  expect(workspaceAuthorized(request())).toBe(false);
  expect(workspaceAuthorized(request('Bearer secret'))).toBe(false);
  expect(
    workspaceAuthorized(request(`Basic ${Buffer.from('operator:wrong').toString('base64')}`)),
  ).toBe(false);
  expect(
    workspaceAuthorized(
      request(`Basic ${Buffer.from('operator:secret:with:colons').toString('base64')}`),
    ),
  ).toBe(true);
});
test('required authentication fails closed when credentials are missing', () => {
  vi.stubEnv('CASEFORGE_AUTH_USER', '');
  vi.stubEnv('CASEFORGE_AUTH_PASSWORD', '');
  vi.stubEnv('CASEFORGE_REQUIRE_AUTH', 'true');
  expect(workspaceAuthorized(new Request('http://localhost'))).toBe(false);
});
test('production defaults to authenticated access and requires an explicit local opt-out', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('CASEFORGE_AUTH_USER', '');
  vi.stubEnv('CASEFORGE_AUTH_PASSWORD', '');
  vi.stubEnv('CASEFORGE_ALLOW_UNAUTHENTICATED', '');
  expect(workspaceAuthorized(new Request('http://localhost'))).toBe(false);
  vi.stubEnv('CASEFORGE_ALLOW_UNAUTHENTICATED', 'true');
  expect(workspaceAuthorized(new Request('http://localhost'))).toBe(true);
});
