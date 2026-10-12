import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const isolated = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));

vi.mock('@/db', async () => {
  const result = await (await import('@/server/testing/testDatabase')).createTestDatabase();

  isolated.client = result.client;

  return { db: result.db };
});
vi.mock('@/server/shared/auth', () => ({
  requireUserId: async (request: Request) => {
    const user = request.headers.get('test-user');

    if (!user) {
      const { WorkspaceError } = await import('@/server/shared/errors');

      throw new WorkspaceError('请先登录', 401);
    }

    return user;
  },
}));
import { db } from '@/db';
import { authUsers, browserProviderIntegrations, testRuns } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { decryptSecret } from '@/server/shared/secrets';
import { browserProviderDefinitions, type BrowserProviderDefinition } from './registry';
import { browserlessProvider } from '@/automation/platform/web/providers/browserless';
import {
  readBrowserProviders,
  saveBrowserProvider,
  savedBrowserProvider,
  browserProviderForRun,
} from './repository';
import { PUT } from '@/app/api/integrations/browser-providers/[provider]/route';

const input = {
  version: 0,
  enabled: true,
  endpoint: 'wss://example.com/chromium/playwright?token=embedded',
  token: 'secret-token',
};

beforeEach(async () => {
  vi.stubEnv('CASEFORGE_INTEGRATION_SECRET', 'browser-provider-test-secret-at-least-32-characters');
  await isolated.client!.exec(
    'TRUNCATE auth_users, browser_provider_integrations, test_runs CASCADE',
  );
  await db.insert(authUsers).values([
    { id: 'alice', name: 'Alice', email: 'alice@example.com' },
    { id: 'bob', name: 'Bob', email: 'bob@example.com' },
  ]);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await isolated.client!.close();
});

describe('browser provider configuration', () => {
  it('encrypts credentials, returns only status, preserves blank values and supports clearing embedded tokens', async () => {
    const saved = await saveBrowserProvider('browserless', input, 'alice');

    expect(saved).toMatchObject({
      version: 1,
      enabled: true,
      configured: true,
      hasCredentials: true,
    });
    expect(JSON.stringify(saved)).not.toContain('secret-token');
    expect(saved).not.toHaveProperty('endpoint');
    const [row] = await db.select().from(browserProviderIntegrations);

    expect(row.encryptedConfig).not.toContain('secret-token');
    expect(decryptSecret(row.encryptedConfig, 'alice', 'browserless')).toEqual({
      endpoint: 'wss://example.com/chromium/playwright',
      token: 'secret-token',
    });
    await saveBrowserProvider('browserless', { version: 1, enabled: false }, 'alice');
    expect((await savedBrowserProvider('browserless', 'alice')).config).toMatchObject({
      token: 'secret-token',
    });
    const cleared = await saveBrowserProvider(
      'browserless',
      { version: 2, enabled: true, clearToken: true },
      'alice',
    );

    expect(cleared.hasCredentials).toBe(false);
    expect((await savedBrowserProvider('browserless', 'alice')).config).not.toHaveProperty('token');
  });
  it('isolates users and local unassigned configuration and resolves the persisted run owner', async () => {
    await saveBrowserProvider('browserless', input, 'alice');
    await saveBrowserProvider('browserless', { ...input, token: 'local-token' }, null);
    expect((await readBrowserProviders('bob'))[0].configured).toBe(false);
    const [run] = await db
      .insert(testRuns)
      .values({
        userId: 'alice',
        name: 'run',
        goal: 'test',
        url: 'https://example.com',
        status: 'queued',
      })
      .returning();

    expect((await browserProviderForRun(run.id))!.config).toMatchObject({ token: 'secret-token' });
    await db.update(testRuns).set({ userId: 'bob' }).where(eq(testRuns.id, run.id));
    expect(await browserProviderForRun(run.id)).toBeUndefined();
    await expect(savedBrowserProvider('browserless', 'bob')).rejects.toThrow('请先保存');
    await expect(browserProviderForRun('00000000-0000-4000-8000-000000000000')).rejects.toThrow(
      '执行记录不存在',
    );
  });
  it('rejects stale versions and invalid endpoints and handles unknown providers', async () => {
    await saveBrowserProvider('browserless', input, 'alice');
    await expect(saveBrowserProvider('browserless', input, 'alice')).rejects.toMatchObject({
      status: 409,
    });
    for (const endpoint of [
      'https://example.com/chromium/playwright',
      'ws://user:password@example.com/chromium/playwright',
      'wss://example.com',
      'wss://example.com/webkit/playwright',
    ]) {
      await expect(
        saveBrowserProvider('browserless', { ...input, version: 1, endpoint }, 'alice'),
      ).rejects.toThrow('配置无效');
    }

    await expect(saveBrowserProvider('unknown', input, 'alice')).rejects.toMatchObject({
      status: 404,
    });
  });
  it('fails visibly for unreadable enabled configurations and allows full replacement', async () => {
    await saveBrowserProvider('browserless', input, 'alice');
    await db.update(browserProviderIntegrations).set({ encryptedConfig: 'corrupt' });
    expect((await readBrowserProviders('alice'))[0]).toMatchObject({
      configured: false,
      configurationError: expect.any(String),
    });
    await expect(savedBrowserProvider('browserless', 'alice')).rejects.toThrow('无法解密');
    await expect(
      saveBrowserProvider('browserless', { version: 1, enabled: true }, 'alice'),
    ).rejects.toThrow('完整配置');
    expect(
      await saveBrowserProvider('browserless', { ...input, version: 1 }, 'alice'),
    ).toMatchObject({ configured: true });
  });
  it('switches active providers through the generic store without changing runtime code', async () => {
    const definitions = browserProviderDefinitions as BrowserProviderDefinition[];

    // A fake second adapter proves the extension point without pretending to implement BrowserStack.
    definitions.push({
      ...definitions[0],
      name: 'Test provider',
      adapter: { ...browserlessProvider, id: 'test-provider' },
    });
    try {
      await saveBrowserProvider('browserless', input, 'alice');
      await saveBrowserProvider('test-provider', input, 'alice');
      const results = await readBrowserProviders('alice');

      expect(results.find((row) => row.provider === 'browserless')).toMatchObject({
        enabled: false,
        version: 2,
      });
      expect(results.find((row) => row.provider === 'test-provider')).toMatchObject({
        enabled: true,
      });
      const [row] = await db
        .select()
        .from(browserProviderIntegrations)
        .where(eq(browserProviderIntegrations.provider, 'test-provider'));

      expect(() => decryptSecret(row.encryptedConfig, 'alice', 'browserless')).toThrow();
    } finally {
      definitions.pop();
    }
  });
  it('rejects unauthenticated saves', async () => {
    const response = await PUT(
      new Request('http://localhost/api/integrations/browser-providers/browserless', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
      { params: Promise.resolve({ provider: 'browserless' }) },
    );

    expect(response.status).toBe(401);
    expect(await db.select().from(browserProviderIntegrations)).toHaveLength(0);
  });
  it('authenticates the generic save endpoint and returns safe status', async () => {
    const response = await PUT(
      new Request('http://localhost/api/integrations/browser-providers/browserless', {
        method: 'PUT',
        headers: { 'test-user': 'alice', 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
      { params: Promise.resolve({ provider: 'browserless' }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      integration: { provider: 'browserless', configured: true },
    });
    const [row] = await db.select().from(browserProviderIntegrations);

    expect(row.userId).toBe('alice');
  });
});
