import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const isolated = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));

vi.mock('@/db', async () => {
  const result = await (await import('@/server/testing/testDatabase')).createTestDatabase();

  isolated.client = result.client;

  return { db: result.db };
});
vi.mock('@/server/shared/auth', async () => {
  const { WorkspaceError } = await import('@/server/shared/errors');

  return {
    requireUserId: async (request: Request) => {
      const user = request.headers.get('test-user');

      if (!user) throw new WorkspaceError('请先登录', 401);

      return user;
    },
  };
});
import { db } from '@/db';
import { authUsers, loginIdentities, loginStateCaches, testRuns } from '@/db/schema';
import { saveTest, deleteTest } from '@/server/test-cases/repository';
import { createRun } from '@/server/runs/repository';
import {
  saveLoginIdentity,
  readLoginIdentities,
  deleteLoginIdentity,
  clearLoginState,
  identityFor,
  identityCredentials,
} from './repository';
import { POST as verify } from '@/app/api/login-identities/[id]/verify/route';
import { GET as list, POST as createIdentity } from '@/app/api/login-identities/route';
import { eq } from 'drizzle-orm';
import { withLoginRefreshLock, readCachedLoginState } from './cache';

const plan = {
  rootId: 'login',
  nodes: {
    login: {
      id: 'login',
      kind: 'task' as const,
      actionType: 'login' as const,
      goal: '登录',
      dependsOn: [],
      requirementIds: [],
      assertions: [],
    },
  },
};
const target = {
  schemaVersion: 1 as const,
  platform: 'web' as const,
  browser: 'chromium' as const,
  deviceProfile: 'legacy-desktop' as const,
  url: 'https://app.example/login',
};
let flow: Awaited<ReturnType<typeof saveTest>>;
const profileInput = () => ({
  version: 0,
  name: '管理员',
  website: 'https://app.example',
  loginTestId: flow.id,
  checkUrl: 'https://app.example/account',
  successText: '退出登录',
  ttlMinutes: 60,
  inputs: {},
});

beforeEach(async () => {
  vi.stubEnv('CASEFORGE_INTEGRATION_SECRET', 'login-identity-secret-at-least-32-characters');
  await isolated.client!.exec(
    'TRUNCATE auth_users, test_cases, test_runs, login_identities, login_state_caches, submission_requests CASCADE',
  );
  await db.insert(authUsers).values([
    { id: 'alice', name: 'Alice', email: 'alice@example.com' },
    { id: 'bob', name: 'Bob', email: 'bob@example.com' },
  ]);
  flow = await saveTest(
    { name: '登录流程', url: target.url, goal: '登录', tags: [], target, plan },
    undefined,
    'alice',
  );
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await isolated.client!.close();
});

describe('login identity ownership and references', () => {
  it('returns field errors for stale input types and missing sensitive values without exposing secrets', async () => {
    flow = await saveTest(
      {
        ...flow,
        target: {
          ...target,
          inputs: { password: { secretRef: 'LOGIN_PASSWORD', label: '登录密码' } },
        },
      },
      flow.id,
      'alice',
    );
    const request = (inputs: unknown, secrets: unknown) =>
      createIdentity(
        new Request('http://localhost/api/login-identities', {
          method: 'POST',
          headers: { 'test-user': 'alice', 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...profileInput(), inputs, secrets }),
        }),
      );
    const mismatch = await request({ password: { value: '' } }, { password: 'must-stay-private' });

    expect(mismatch.status).toBe(400);
    const body = await mismatch.json();

    expect(body.fieldErrors['inputs.password']).toContain('登录密码');
    expect(JSON.stringify(body)).not.toContain('must-stay-private');
    const missing = await request({ password: { secretRef: 'LOGIN_PASSWORD' } }, {});

    expect(missing.status).toBe(400);
    expect((await missing.json()).fieldErrors['inputs.password']).toBe('请填写登录密码。');
    expect(await db.select().from(loginIdentities)).toHaveLength(0);
  });
  it('rejects removed inputs and ambiguous flow labels and returns a complete identity on save', async () => {
    await expect(
      saveLoginIdentity({ ...profileInput(), inputs: { removed: { value: 'old' } } }, 'alice'),
    ).rejects.toMatchObject({ fieldErrors: { 'inputs.removed': expect.any(String) } });
    flow = await saveTest(
      {
        ...flow,
        target: {
          ...target,
          inputs: { username: { value: '' }, extra: { value: '', label: '账号' } },
        },
      },
      flow.id,
      'alice',
    );
    await expect(
      saveLoginIdentity({ ...profileInput(), inputs: flow.target?.inputs }, 'alice'),
    ).rejects.toMatchObject({ fieldErrors: { loginTestId: expect.stringContaining('重复') } });
    flow = await saveTest(
      { ...flow, target: { ...target, inputs: { username: { value: '', label: '邮箱' } } } },
      flow.id,
      'alice',
    );
    const identity = await saveLoginIdentity(
      { ...profileInput(), inputs: { username: { value: 'alice', label: 'old label' } } },
      'alice',
    );

    expect(identity).toMatchObject({
      status: 'unverified',
      references: [],
      inputs: { username: { value: 'alice', label: '邮箱' } },
    });
  });
  it('encrypts UI passwords, never returns them, preserves blank edits and replaces them without env changes', async () => {
    flow = await saveTest(
      { ...flow, target: { ...target, inputs: { password: { secretRef: 'LOGIN_PASSWORD' } } } },
      flow.id,
      'alice',
    );
    const input = {
      ...profileInput(),
      inputs: { password: { secretRef: 'LOGIN_PASSWORD' } },
      secrets: { password: 'private-password' },
    };
    const response = await createIdentity(
      new Request('http://localhost/api/login-identities', {
        method: 'POST',
        headers: { 'test-user': 'alice', 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );

    expect(response.status).toBe(201);
    const { identity } = await response.json();

    expect(identity.configuredSecrets).toEqual(['password']);
    expect(JSON.stringify(identity)).not.toContain('private-password');
    expect(identity).not.toHaveProperty('encryptedCredentials');
    const row = await identityFor(identity.id, 'alice');

    expect(row.encryptedCredentials).not.toContain('private-password');
    expect(identityCredentials(row)).toEqual({ password: 'private-password' });
    await expect(identityFor(identity.id, 'bob')).rejects.toMatchObject({ status: 404 });
    const retained = await saveLoginIdentity(
      { ...profileInput(), version: 1, inputs: identity.inputs },
      'alice',
      identity.id,
    );

    expect(identityCredentials(await identityFor(identity.id, 'alice')).password).toBe(
      'private-password',
    );
    const updated = await saveLoginIdentity(
      {
        ...profileInput(),
        version: 2,
        inputs: retained.inputs,
        secrets: { password: 'new-password' },
      },
      'alice',
      identity.id,
    );

    expect(identityCredentials(await identityFor(identity.id, 'alice')).password).toBe(
      'new-password',
    );
    expect(JSON.stringify(await readLoginIdentities('alice'))).not.toContain('new-password');
    expect(updated.inputs.password).not.toEqual(identity.inputs.password);
    const verification = await createRun({ loginIdentityId: identity.id }, undefined, 'alice');

    expect(JSON.stringify(verification)).not.toContain('new-password');
    const [stored] = await db.select().from(loginIdentities);

    expect(stored.encryptedCredentials).toMatch(/^v1\./);
  });
  it('saves identities, isolates owners and limits login flows to standalone Web cases', async () => {
    const identity = await saveLoginIdentity(profileInput(), 'alice');

    expect((await readLoginIdentities('alice')).identities[0]).toMatchObject({
      id: identity.id,
      status: 'unverified',
      references: [],
    });
    expect((await readLoginIdentities('bob')).identities).toHaveLength(0);
    expect((await readLoginIdentities(null)).identities).toHaveLength(0);
    await expect(saveLoginIdentity(profileInput(), 'bob')).rejects.toThrow('登录流程');
    await expect(
      saveLoginIdentity({ ...profileInput(), checkUrl: 'https://other.example/account' }, 'alice'),
    ).rejects.toThrow('同一网站');
    await expect(
      saveLoginIdentity({ ...profileInput(), version: 0 }, 'alice', identity.id),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('rejects foreign or mismatched identity references and protects referenced identities and flows', async () => {
    const identity = await saveLoginIdentity(profileInput(), 'alice');
    const business = {
      name: '业务',
      url: 'https://app.example/orders',
      goal: '检查订单',
      tags: [],
      target: { ...target, url: 'https://app.example/orders', loginIdentityId: identity.id },
      plan,
    };
    const test = await saveTest(business, undefined, 'alice');

    expect((await readLoginIdentities('alice')).identities[0].references).toEqual([
      { id: test.id, name: '业务' },
    ]);
    await expect(saveTest(business, undefined, 'bob')).rejects.toMatchObject({ status: 404 });
    await expect(
      saveTest(
        { ...business, target: { ...business.target, url: 'https://other.example' } },
        undefined,
        'alice',
      ),
    ).rejects.toThrow('不匹配');
    await expect(deleteLoginIdentity(identity.id, 'alice')).rejects.toMatchObject({ status: 409 });
    await expect(deleteTest(flow.id, 'alice')).rejects.toMatchObject({ status: 409 });
    await expect(saveTest({ ...business, name: '循环登录' }, flow.id, 'alice')).rejects.toThrow(
      '前置流程',
    );
    await deleteTest(test.id, 'alice');
    await deleteLoginIdentity(identity.id, 'alice');
    await deleteTest(flow.id, 'alice');
  });
  it('encrypts cached state, scopes decryption and invalidates caches after edits or explicit clearing', async () => {
    const identity = await saveLoginIdentity(profileInput(), 'alice');
    const state = {
      cookies: [
        {
          name: 'session',
          value: 'private-session',
          domain: 'app.example',
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: true,
          sameSite: 'Lax' as const,
        },
      ],
      origins: [],
    };

    await withLoginRefreshLock(
      'cache-key',
      identity.id,
      new AbortController().signal,
      async (publish) => {
        await publish(state, 60);
      },
    );
    const [row] = await db.select().from(loginStateCaches);

    expect(row.encryptedState).not.toContain('private-session');
    expect(await readCachedLoginState('cache-key', 'alice')).toEqual(state);
    expect(await readCachedLoginState('cache-key', 'bob')).toBeUndefined();
    await saveLoginIdentity({ ...profileInput(), version: 1 }, 'alice', identity.id);
    expect(await db.select().from(loginStateCaches)).toHaveLength(0);
    await withLoginRefreshLock(
      'cache-key',
      identity.id,
      new AbortController().signal,
      async (publish) => {
        await publish(state, 60);
      },
    );
    await clearLoginState(identity.id, 'alice');
    expect(await readCachedLoginState('cache-key', 'alice')).toBeUndefined();
  });
  it('queues verification through an authenticated, idempotent API and suppresses duplicate active checks', async () => {
    const identity = await saveLoginIdentity(profileInput(), 'alice');
    const context = { params: Promise.resolve({ id: identity.id }) };
    const request = (key: string, user = 'alice') =>
      new Request('http://localhost/api/login-identities/verify', {
        method: 'POST',
        headers: { 'test-user': user, 'Idempotency-Key': key },
      });
    const first = await verify(request('00000000-0000-4000-8000-000000000001'), context);

    expect(first.status).toBe(202);
    const result = await first.json();
    const second = await verify(request('00000000-0000-4000-8000-000000000002'), context);

    expect(await second.json()).toEqual(result);
    const [run] = await db.select().from(testRuns);

    expect(run).toMatchObject({
      authenticationVerification: true,
      status: 'queued',
      userId: 'alice',
    });
    expect((await readLoginIdentities('alice')).identities[0].status).toBe('verifying');
    expect(
      (await verify(request('00000000-0000-4000-8000-000000000003', 'bob'), context)).status,
    ).toBe(404);
    expect((await list(new Request('http://localhost/api/login-identities'))).status).toBe(401);
    await expect(deleteLoginIdentity(identity.id, 'alice')).rejects.toMatchObject({ status: 409 });
    await db.update(testRuns).set({ status: 'failed' }).where(eq(testRuns.id, run.id));
    expect((await readLoginIdentities('alice')).identities[0].status).toBe('failed');
  });
  it('freezes the selected identity reference into run targets and validates ownership at submission', async () => {
    const identity = await saveLoginIdentity(profileInput(), 'alice');
    const run = await createRun(
      {
        draft: {
          name: '业务',
          goal: '检查订单',
          plan,
          target: { ...target, loginIdentityId: identity.id },
        },
      },
      undefined,
      'alice',
    );

    expect(run.targetSnapshot).toMatchObject({ loginIdentityId: identity.id });
    await expect(
      createRun({ loginIdentityId: identity.id }, undefined, 'bob'),
    ).rejects.toMatchObject({ status: 404 });
  });
});
