import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { chromium, type Browser, type BrowserContextOptions } from 'playwright';
import type { WebTarget } from '@/automation/platform/target';

const fixtures = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
  planned: vi.fn(),
}));

vi.mock('@/db', async () => {
  const result = await (await import('@/server/testing/testDatabase')).createTestDatabase();

  fixtures.client = result.client;

  return { db: result.db };
});
vi.mock('@/automation/platform/web/webPlanner', () => ({
  WebActionPlanner: class {
    plan() {
      fixtures.planned();

      return { done: true, steps: [] };
    }
  },
}));
import { db } from '@/db';
import { loginStateCaches, testRuns } from '@/db/schema';
import { saveTest } from '@/server/test-cases/repository';
import { saveLoginIdentity, clearLoginState, identityFor } from './repository';
import { prepareRunLogin } from './runtime';
import { eq } from 'drizzle-orm';

let server: Server;
let browser: Browser;
let url: string;
let token = 0;
let logins = 0;
let target: WebTarget;
let runId: string;
let identityId: string;

beforeAll(async () => {
  vi.stubEnv('CASEFORGE_INTEGRATION_SECRET', 'login-runtime-secret-at-least-32-characters');
  server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (request.url === '/login') {
      logins++;
      token++;
      response.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly`);
      response.end('<h1>登录成功</h1>');
    } else
      response.end(
        request.headers.cookie === `session=${token}` ? '<h1>管理员工作台</h1>' : '<h1>请登录</h1>',
      );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await chromium.launch({ headless: true });
}, 30000);
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fixtures.client!.close();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.stubEnv('CASEFORGE_INTEGRATION_SECRET', 'login-runtime-secret-at-least-32-characters');
  vi.stubEnv('BETTER_AUTH_SECRET', '');
  await fixtures.client!.exec(
    'TRUNCATE login_identities, login_state_caches, test_runs, test_cases CASCADE',
  );
  fixtures.planned.mockClear();
  logins = 0;
  token = 0;
  const plainTarget: WebTarget = {
    schemaVersion: 1,
    platform: 'web',
    browser: 'chromium',
    deviceProfile: 'legacy-desktop',
    url: `${url}/login`,
  };
  const plan = {
    rootId: 'login',
    nodes: {
      login: {
        id: 'login',
        kind: 'task' as const,
        goal: '登录',
        dependsOn: [],
        requirementIds: [],
        assertions: [],
      },
    },
  };
  const flow = await saveTest({
    name: '登录流程',
    url: plainTarget.url,
    goal: '登录',
    target: plainTarget,
    tags: [],
    plan,
  });
  const identity = await saveLoginIdentity(
    {
      version: 0,
      name: '管理员',
      website: url,
      loginTestId: flow.id,
      checkUrl: `${url}/account`,
      successText: '管理员工作台',
    },
    null,
  );

  identityId = identity.id;
  target = { ...plainTarget, url: `${url}/orders`, loginIdentityId: identity.id };
  const [run] = await db
    .insert(testRuns)
    .values({
      name: '测试',
      url: target.url,
      goal: '检查订单',
      status: 'queued',
      targetSnapshot: target,
    })
    .returning();

  runId = run.id;
});
const prepare = (
  options: { forceRefresh?: boolean; signal?: AbortSignal; profile?: BrowserContextOptions } = {},
) =>
  prepareRunLogin({
    runId,
    target,
    browser,
    provider: 'local',
    profile: options.profile ?? { viewport: { width: 640, height: 480 } },
    model: {
      generate: async () => {
        throw new Error('Unexpected real model call');
      },
    },
    signal: options.signal ?? new AbortController().signal,
    report: async () => {},
    forceRefresh: options.forceRefresh,
  });

it('logs in once, restores isolated contexts and never caches mutations made by business tests', async () => {
  const first = await prepare();

  expect(first.preparation?.reused).toBe(false);
  const context = await browser.newContext({ storageState: first.storageState });

  await context.clearCookies();
  await context.close();
  const second = await prepare({ profile: { viewport: { height: 480, width: 640 } } });

  expect(second.preparation?.reused).toBe(true);
  expect(logins).toBe(1);
  expect(fixtures.planned).toHaveBeenCalledOnce();
  const [cache] = await db.select().from(loginStateCaches);

  expect(cache.encryptedState).not.toContain('session');
}, 30000);
it('loads saved passwords and refreshes after a UI password update without restarting the worker', async () => {
  const identity = await identityFor(identityId, null);
  const config = {
    name: identity.name,
    website: identity.website,
    loginTestId: identity.loginTestId,
    checkUrl: identity.checkUrl,
    successText: identity.successText,
    ttlMinutes: identity.ttlMinutes,
    version: identity.version,
    inputs: { password: { secretRef: 'LOGIN_PASSWORD' } },
    secrets: { password: 'first-ui-password' },
  };

  vi.stubEnv('CASEFORGE_SECRET_LOGIN_PASSWORD', '');
  const saved = await saveLoginIdentity(config, null, identityId);

  expect((await prepare()).preparation?.reused).toBe(false);
  expect((await prepare()).preparation?.reused).toBe(true);
  await saveLoginIdentity(
    {
      ...config,
      version: saved.version,
      inputs: saved.inputs,
      secrets: { password: 'updated-ui-password' },
    },
    null,
    identityId,
  );
  expect((await prepare()).preparation?.reused).toBe(false);
  expect(logins).toBe(2);
}, 30000);
it('refreshes expired or invalid states once and supports manual force refresh', async () => {
  await prepare();
  token++;
  expect((await prepare()).preparation?.reused).toBe(false);
  expect(logins).toBe(2);
  await db.update(loginStateCaches).set({ expiresAt: new Date(Date.now() - 1000).toISOString() });
  await prepare();
  expect(logins).toBe(3);
  await prepare({ forceRefresh: true });
  expect(logins).toBe(4);
}, 30000);
it('serializes concurrent refreshes and rechecks a cache filled by another worker', async () => {
  const results = await Promise.all([prepare(), prepare()]);

  expect(logins).toBe(1);
  expect(results.map((item) => item.preparation?.reused).sort()).toEqual([false, true]);
}, 30000);
it('cancels preparation, releases refresh locks and permits a later retry', async () => {
  const controller = new AbortController();

  controller.abort(new Error('cancelled'));
  await expect(prepare({ signal: controller.signal })).rejects.toThrow('cancelled');
  expect(logins).toBe(0);
  await prepare();
  await clearLoginState(identityId, null);
  expect(await db.select().from(loginStateCaches)).toHaveLength(0);
}, 30000);
it('fails visibly before business steps when the success marker is absent', async () => {
  const { loginIdentities } = await import('@/db/schema');

  await db
    .update(loginIdentities)
    .set({ successText: 'Wrong marker' })
    .where(eq(loginIdentities.id, identityId));
  await expect(prepare()).rejects.toThrow('业务步骤尚未开始');
  const [cache] = await db.select().from(loginStateCaches);

  expect(cache.encryptedState).toBeNull();
  expect(cache.lockToken).toBeNull();
}, 30000);

it('reports state persistence failures distinctly from a missing success marker', async () => {
  vi.stubEnv('CASEFORGE_INTEGRATION_SECRET', '');
  await expect(prepare()).rejects.toThrow('业务步骤尚未开始');
  const { loginIdentities } = await import('@/db/schema');
  const [identity] = await db
    .select()
    .from(loginIdentities)
    .where(eq(loginIdentities.id, identityId));

  expect(identity.lastError).toBe('登录准备失败：保存登录态');
  const [cache] = await db.select().from(loginStateCaches);

  expect(cache.encryptedState).toBeNull();
  expect(cache.lockToken).toBeNull();
}, 30000);
