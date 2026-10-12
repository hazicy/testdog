import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { expect, test } from 'vitest';
import { createTestDatabase } from '@testdog/server/testing/testDatabase';
import {
  authUsers,
  authSessions,
  authAccounts,
  authVerifications,
} from '@testdog/server/db/schema';

test('persists users, hashes passwords, validates sessions and revokes them on logout', async () => {
  const { client, db } = await createTestDatabase();
  const auth = betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'integration-test-secret-with-at-least-32-characters',
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128 },
    socialProviders: {
      github: { clientId: 'test-github-client', clientSecret: 'test-github-secret' },
    },
    rateLimit: { enabled: false },
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
  });

  async function post(path: string, body: object, cookie?: string) {
    return auth.handler(
      new Request('http://localhost:3000/api/auth/' + path, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  }

  try {
    const untrusted = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({
          name: 'Untrusted',
          email: 'evil@example.com',
          password: 'correct-password',
        }),
      }),
    );

    expect(untrusted.status).toBe(403);
    const social = await post('sign-in/social', { provider: 'github', callbackURL: '/cases' });

    expect(social.status).toBe(200);
    const authorization = new URL((await social.json()).url);

    expect(authorization.origin).toBe('https://github.com');
    expect(authorization.searchParams.get('client_id')).toBe('test-github-client');
    expect(authorization.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/callback/github',
    );
    expect(authorization.searchParams.get('state')).toBeTruthy();

    const signup = await post('sign-up/email', {
      name: '测试用户',
      email: 'user@example.com',
      password: 'correct-password',
    });

    expect(signup.status).toBe(200);
    const user = (await client.query<{ id: string }>('SELECT * FROM auth_users')).rows[0];

    expect(user).toMatchObject({
      name: '测试用户',
      email: 'user@example.com',
      emailVerified: false,
    });
    const account = (await client.query<{ password: string }>('SELECT password FROM auth_accounts'))
      .rows[0];

    expect(account.password).toBeTruthy();
    expect(account.password).not.toBe('correct-password');
    expect(
      (
        await post('sign-up/email', {
          name: '重复',
          email: 'user@example.com',
          password: 'correct-password',
        })
      ).ok,
    ).toBe(false);
    expect(
      (await post('sign-in/email', { email: 'user@example.com', password: 'wrong-password' }))
        .status,
    ).toBe(401);
    const login = await post('sign-in/email', {
      email: 'user@example.com',
      password: 'correct-password',
    });

    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });

    expect(session?.user.id).toBe(user.id);
    expect(
      await auth.api.getSession({
        headers: new Headers({ cookie: 'better-auth.session_token=forged' }),
      }),
    ).toBeNull();
    expect((await post('update-user', { name: '更新姓名' }, cookie)).status).toBe(200);
    expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.name).toBe(
      '更新姓名',
    );
    expect((await post('update-user', { name: '匿名修改' })).status).toBe(401);
    expect(
      (
        await post(
          'change-password',
          { currentPassword: 'wrong-password', newPassword: 'new-password' },
          cookie,
        )
      ).ok,
    ).toBe(false);
    const changed = await post(
      'change-password',
      {
        currentPassword: 'correct-password',
        newPassword: 'new-password',
        revokeOtherSessions: true,
      },
      cookie,
    );

    expect(changed.status).toBe(200);
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
    expect(
      (await post('sign-in/email', { email: 'user@example.com', password: 'correct-password' }))
        .status,
    ).toBe(401);
    const newLogin = await post('sign-in/email', {
      email: 'user@example.com',
      password: 'new-password',
    });

    expect(newLogin.status).toBe(200);
    const newCookie = newLogin.headers.get('set-cookie')!.split(';')[0];

    expect((await post('sign-out', {}, newCookie)).status).toBe(200);
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
    expect(
      (await post('sign-up/email', { name: 'Weak', email: 'weak@example.com', password: 'short' }))
        .ok,
    ).toBe(false);
  } finally {
    await client.close();
  }
}, 30000);
