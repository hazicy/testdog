import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authorized = vi.hoisted(() => vi.fn());

vi.mock('./server/shared/auth', () => ({ workspaceAuthorized: authorized }));
import { proxy } from './proxy';

beforeEach(() => {
  authorized.mockReset();
  authorized.mockResolvedValue(false);
});

test('allows public entry points and OAuth callbacks without a session', async () => {
  for (const path of [
    '/',
    '/login',
    '/register',
    '/api/auth/sign-up/email',
    '/api/auth/callback/google',
  ]) {
    expect((await proxy(new NextRequest('http://localhost' + path))).status).toBe(200);
  }

  expect(authorized).not.toHaveBeenCalled();
});

test('protects pages and returns JSON 401 for APIs including evidence and realtime', async () => {
  const page = await proxy(new NextRequest('http://localhost/runs/abc?tab=logs'));

  expect(page.status).toBe(307);
  expect(page.headers.get('location')).toBe(
    'http://localhost/login?callbackURL=%2Fruns%2Fabc%3Ftab%3Dlogs',
  );
  for (const path of ['/api/runs', '/api/events', '/api/runs/abc/artifacts/def']) {
    const result = await proxy(new NextRequest('http://localhost' + path));

    expect(result.status).toBe(401);
    expect(result.headers.get('cache-control')).toBe('no-store');
  }
});

test('allows authenticated access', async () => {
  authorized.mockResolvedValue(true);
  expect((await proxy(new NextRequest('http://localhost/cases'))).status).toBe(200);
});
