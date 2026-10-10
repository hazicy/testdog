import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const getSession = vi.hoisted(() => vi.fn());

vi.mock('@/server/auth/auth', () => ({ auth: { api: { getSession } } }));
import { requireUserId, workspaceAuthorized } from './auth';

beforeEach(() => {
  getSession.mockReset();
  vi.stubEnv('CASEFORGE_ALLOW_UNAUTHENTICATED', '');
});
afterEach(() => vi.unstubAllEnvs());

test('requires a database validated session, even with a forged cookie or legacy Basic credentials', async () => {
  getSession.mockResolvedValue(null);
  const request = new Request('http://localhost/api/runs', {
    headers: {
      cookie: 'better-auth.session_token=forged',
      authorization: 'Basic b3BlcmF0b3I6c2VjcmV0',
    },
  });

  expect(await workspaceAuthorized(request)).toBe(false);
  expect(getSession).toHaveBeenCalledWith({ headers: request.headers });
});

test('allows authenticated users', async () => {
  getSession.mockResolvedValue({ user: { id: 'user-1' }, session: { id: 'session-1' } });
  expect(await workspaceAuthorized(new Request('http://localhost/cases'))).toBe(true);
});

test('requires an explicit local opt-out in every environment', async () => {
  getSession.mockResolvedValue(null);
  vi.stubEnv('NODE_ENV', 'development');
  expect(await workspaceAuthorized(new Request('http://localhost/cases'))).toBe(false);
  vi.stubEnv('CASEFORGE_ALLOW_UNAUTHENTICATED', 'true');
  expect(await workspaceAuthorized(new Request('http://localhost/cases'))).toBe(true);
});

test('derives ownership from the session and rejects unauthenticated API calls', async () => {
  const request = new Request('http://localhost/api/tests', { headers: { 'x-user-id': 'forged' } });

  getSession.mockResolvedValue(null);
  await expect(requireUserId(request)).rejects.toMatchObject({ status: 401 });
  vi.stubEnv('CASEFORGE_ALLOW_UNAUTHENTICATED', 'true');
  expect(await requireUserId(request)).toBeNull();
  getSession.mockResolvedValue({ user: { id: 'real-user' } });
  expect(await requireUserId(request)).toBe('real-user');
});
