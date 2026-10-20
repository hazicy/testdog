import { defaultWebTarget, targetUrl } from '@testdog/contracts/automation/platform/target';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';

const isolated = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));
const send = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@testdog/server/db', async () => {
  const result = await (await import('@testdog/server/testing/testDatabase')).createTestDatabase();

  isolated.client = result.client;

  return { db: result.db };
});
vi.mock('@testdog/server/integrations/delivery', () => ({ sendNotification: send }));
vi.mock('@/server/shared/auth', async () => {
  const { WorkspaceError } = await import('@testdog/server/shared/errors');

  return {
    requireUserId: async (request: Request) => {
      const user = request.headers.get('test-user');

      if (!user) throw new WorkspaceError('请先登录', 401);

      return user;
    },
  };
});
import { db } from '@testdog/server/db';
import {
  authUsers,
  notificationIntegrations,
  notificationDeliveries,
  notificationEventRecords,
  testRuns,
  issues,
  issueOccurrences,
  issueVerifications,
} from '@testdog/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import {
  readIntegrations,
  saveIntegration,
  queueTest,
  retryDelivery,
} from '@testdog/server/integrations/repository';
import { dispatchNotifications } from '@testdog/server/integrations/dispatcher';
import { decryptSecret, encryptSecret } from '@testdog/server/infrastructure/secrets';
import { POST as testEndpoint } from '../../../../apps/web/src/app/api/integrations/[channel]/test/route';
import { PUT as saveEndpoint } from '../../../../apps/web/src/app/api/integrations/[channel]/route';

beforeEach(async () => {
  vi.stubEnv('TESTDOG_SMTP_HOST', '');
  vi.stubEnv('TESTDOG_INTEGRATION_SECRET', 'integration-test-secret-at-least-32-characters');
  await isolated.client!.exec(
    'TRUNCATE auth_users, notification_integrations, notification_events, notification_deliveries, test_runs, issues, submission_requests CASCADE',
  );
  await db.insert(authUsers).values([
    { id: 'alice', name: 'Alice', email: 'alice@example.com' },
    { id: 'bob', name: 'Bob', email: 'bob@example.com' },
  ]);
  send.mockReset();
  send.mockResolvedValue();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await isolated.client!.close();
});
const input = {
  version: 0,
  enabled: true,
  events: ['run.failed', 'issue.created', 'issue.status_changed', 'verification.completed'],
  webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/test-hook',
  signingSecret: 'test-signing-secret',
};

async function failedRun(userId = 'alice') {
  const [run] = await db
    .insert(testRuns)
    .values({
      userId,
      name: '测试失败',
      goal: 'check',
      targetSnapshot: defaultWebTarget('https://example.com'),
      status: 'queued',
    })
    .returning();

  await db.update(testRuns).set({ status: 'failed' }).where(eq(testRuns.id, run.id));

  return run;
}

it('encrypts credentials, retains blank secrets, rejects stale configuration and isolates owners', async () => {
  const view = await saveIntegration('feishu', input, 'alice');
  const [row] = await db.select().from(notificationIntegrations);

  expect(row.encryptedConfig).not.toContain('test-hook');
  expect(row.encryptedConfig).not.toContain('test-signing-secret');
  expect(JSON.stringify(view)).not.toContain('test-hook');
  expect(decryptSecret(row.encryptedConfig, 'alice', 'feishu')).toMatchObject({
    webhookUrl: input.webhookUrl,
  });
  expect(() => decryptSecret(row.encryptedConfig, 'bob', 'feishu')).toThrow('无法解密');
  expect((await readIntegrations('bob')).integrations.every((item) => !item.configured)).toBe(true);
  const saved = await saveIntegration(
    'feishu',
    { version: 1, enabled: true, events: ['run.failed'] },
    'alice',
  );

  expect(saved.hasSigningSecret).toBe(true);
  await expect(saveIntegration('feishu', input, 'alice')).rejects.toMatchObject({ status: 409 });
  await saveIntegration(
    'feishu',
    { version: 2, enabled: false, events: [], clearSigningSecret: true },
    'alice',
  );
  expect((await readIntegrations('alice')).integrations[0].hasSigningSecret).toBe(false);
});

const emailInput = {
  version: 0,
  enabled: true,
  events: ['run.failed'],
  recipients: ['recipient@example.com'],
};

function configureSmtp() {
  vi.stubEnv('TESTDOG_SMTP_HOST', 'smtp.platform.example.com');
  vi.stubEnv('TESTDOG_SMTP_PORT', '465');
  vi.stubEnv('TESTDOG_SMTP_USERNAME', 'platform@example.com');
  vi.stubEnv('TESTDOG_SMTP_PASSWORD', 'platform-secret');
  vi.stubEnv('TESTDOG_SMTP_FROM', 'platform@example.com');
}

it('stores only email preferences and rejects user-supplied SMTP parameters', async () => {
  const view = await saveIntegration('email', emailInput, 'alice');

  expect(view.email).toEqual({ recipients: emailInput.recipients });
  const [row] = await db.select().from(notificationIntegrations);

  expect(decryptSecret(row.encryptedConfig, 'alice', 'email')).toEqual({
    recipients: emailInput.recipients,
  });
  expect((await readIntegrations('alice')).emailAvailable).toBe(false);
  configureSmtp();
  const result = await readIntegrations('alice');

  expect(result.emailAvailable).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(
    /platform-secret|smtp.platform|platform@example|hasPassword/,
  );
  for (const extra of [
    { host: 'smtp.user.example.com' },
    { port: 465 },
    { username: 'user' },
    { password: 'secret' },
    { from: 'user@example.com' },
  ]) {
    await expect(
      saveIntegration('email', { ...emailInput, version: 1, ...extra }, 'alice'),
    ).rejects.toThrow('通知配置无效');
  }
});

it('reads legacy recipients without exposing SMTP settings and removes legacy credentials on save', async () => {
  const legacy = {
    host: 'smtp.legacy.example.com',
    port: 465 as const,
    username: 'legacy@example.com',
    password: 'legacy-secret',
    from: 'legacy@example.com',
    recipients: emailInput.recipients,
  };

  await db.insert(notificationIntegrations).values({
    userId: 'alice',
    channel: 'email',
    version: 3,
    enabled: true,
    events: ['run.failed'],
    encryptedConfig: encryptSecret(legacy, 'alice', 'email'),
  });
  const result = await readIntegrations('alice');

  expect(result.integrations[1]).toMatchObject({
    version: 3,
    enabled: true,
    events: ['run.failed'],
    email: { recipients: legacy.recipients },
  });
  expect(JSON.stringify(result)).not.toMatch(
    /legacy-secret|smtp.legacy|legacy@example|hasPassword/,
  );
  await saveIntegration('email', { ...emailInput, version: 3 }, 'alice');
  const [row] = await db.select().from(notificationIntegrations);

  expect(decryptSecret(row.encryptedConfig, 'alice', 'email')).toEqual({
    recipients: legacy.recipients,
  });
});

it('allows saving email preferences without platform SMTP but blocks test and retry requests', async () => {
  await saveIntegration('email', emailInput, 'alice');
  await expect(db.transaction((tx) => queueTest('email', 'alice', tx))).rejects.toMatchObject({
    status: 503,
  });
  await expect(retryDelivery('email', randomUUID(), 'alice')).rejects.toMatchObject({
    status: 503,
  });
  expect(await db.select().from(notificationDeliveries)).toHaveLength(0);
  configureSmtp();
  await db.transaction((tx) => queueTest('email', 'alice', tx));
  await dispatchNotifications();
  expect(send).toHaveBeenCalledWith(
    'email',
    { recipients: emailInput.recipients },
    expect.any(Object),
    expect.any(String),
  );
});

it('validates email recipients and subscriptions and preserves owner and version checks', async () => {
  for (const recipients of [
    [],
    ['invalid'],
    Array.from({ length: 11 }, (_, i) => `user${i}@example.com`),
  ]) {
    await expect(saveIntegration('email', { ...emailInput, recipients }, 'alice')).rejects.toThrow(
      '通知配置无效',
    );
  }

  await expect(saveIntegration('email', { ...emailInput, events: [] }, 'alice')).rejects.toThrow(
    '至少选择一个事件',
  );
  await saveIntegration('email', emailInput, 'alice');
  expect((await readIntegrations('bob')).integrations[1].configured).toBe(false);
  await expect(saveIntegration('email', emailInput, 'alice')).rejects.toMatchObject({
    status: 409,
  });
  await saveIntegration(
    'email',
    { ...emailInput, version: 1, recipients: ['updated@example.com'] },
    'alice',
  );
  expect((await readIntegrations('alice')).integrations[1].email?.recipients).toEqual([
    'updated@example.com',
  ]);
});

it('queues committed events exactly once for matching subscriptions and never for other users', async () => {
  await saveIntegration('feishu', input, 'alice');
  const run = await failedRun();

  await db.update(testRuns).set({ error: 'Updated details' }).where(eq(testRuns.id, run.id));
  await failedRun('bob');
  expect(await db.select().from(notificationDeliveries)).toHaveLength(1);
  await expect(
    db.transaction(async (tx) => {
      await tx.insert(issues).values({ userId: 'alice', title: 'rolled back issue' });
      throw new Error('rollback');
    }),
  ).rejects.toThrow('rollback');
  expect(await db.select().from(notificationDeliveries)).toHaveLength(1);
  const [issue] = await db
    .insert(issues)
    .values({ userId: 'alice', title: 'new issue' })
    .returning();

  await db.update(issues).set({ status: 'in_progress', version: 2 }).where(eq(issues.id, issue.id));
  await db.update(issues).set({ description: 'No status change' }).where(eq(issues.id, issue.id));
  expect(
    (await db.select().from(notificationEventRecords)).map((item) => item.eventType).sort(),
  ).toEqual(['issue.created', 'issue.status_changed', 'run.failed']);
  const [verificationRun] = await db
    .insert(testRuns)
    .values({
      userId: 'alice',
      name: 'regression',
      goal: 'check',
      targetSnapshot: defaultWebTarget('https://example.com'),
      status: 'queued',
    })
    .returning();
  const [source] = await db
    .insert(issueOccurrences)
    .values({
      issueId: issue.id,
      runId: run.id,
      snapshot: {
        name: run.name,
        goal: run.goal,
        url: targetUrl(run.targetSnapshot),
        artifacts: [],
      },
    })
    .returning();

  await db
    .insert(issueVerifications)
    .values({ issueId: issue.id, runId: verificationRun.id, occurrenceId: source.id });
  await db.update(testRuns).set({ status: 'passed' }).where(eq(testRuns.id, verificationRun.id));
  expect((await db.select().from(notificationEventRecords)).at(-1)?.eventType).toBe(
    'verification.completed',
  );
  await dispatchNotifications();
  expect(send).toHaveBeenCalledTimes(4);
  expect((await readIntegrations('alice')).deliveries.every((item) => item.status === 'sent')).toBe(
    true,
  );
  expect((await readIntegrations('bob')).deliveries).toEqual([]);
});

it('retries delivery failures, recovers abandoned claims and cancels old configurations', async () => {
  await saveIntegration('feishu', input, 'alice');
  await failedRun();
  send.mockRejectedValue(new Error('飞书拒绝通知。'));
  await dispatchNotifications();
  let [delivery] = await db.select().from(notificationDeliveries);

  expect(delivery).toMatchObject({ status: 'pending', attempts: 1, lastError: '飞书拒绝通知。' });
  for (let index = 0; index < 2; index++) {
    await db
      .update(notificationDeliveries)
      .set({ nextAttemptAt: sql`now() - interval '1 second'` })
      .where(eq(notificationDeliveries.id, delivery.id));
    await dispatchNotifications();
  }

  [delivery] = await db.select().from(notificationDeliveries);
  expect(delivery).toMatchObject({ status: 'failed', attempts: 3 });
  await expect(retryDelivery('feishu', delivery.id, 'bob')).rejects.toMatchObject({ status: 404 });
  await retryDelivery('feishu', delivery.id, 'alice');
  await db
    .update(notificationDeliveries)
    .set({
      status: 'sending',
      attempts: 1,
      leaseToken: randomUUID(),
      leaseUntil: sql`now() - interval '1 second'`,
    })
    .where(eq(notificationDeliveries.id, delivery.id));
  send.mockResolvedValue();
  await dispatchNotifications();
  expect((await db.select().from(notificationDeliveries))[0]).toMatchObject({
    status: 'sent',
    attempts: 2,
  });
  await failedRun();
  await saveIntegration('feishu', { version: 1, enabled: false, events: [] }, 'alice');
  await dispatchNotifications();
  expect((await db.select().from(notificationDeliveries)).at(-1)?.status).toBe('skipped');
});

it('dispatches a mixed-owner batch using each delivery configuration and payload', async () => {
  await saveIntegration('feishu', input, 'alice');
  const bobWebhook = 'https://open.feishu.cn/open-apis/bot/v2/hook/bob-hook';

  await saveIntegration('feishu', { ...input, webhookUrl: bobWebhook }, 'bob');
  const aliceRun = await failedRun('alice');
  const bobRun = await failedRun('bob');

  await dispatchNotifications(10);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send).toHaveBeenCalledWith(
    'feishu',
    expect.objectContaining({ webhookUrl: input.webhookUrl }),
    expect.objectContaining({ path: `/runs/${aliceRun.id}` }),
    expect.any(String),
  );
  expect(send).toHaveBeenCalledWith(
    'feishu',
    expect.objectContaining({ webhookUrl: bobWebhook }),
    expect.objectContaining({ path: `/runs/${bobRun.id}` }),
    expect.any(String),
  );
  expect((await readIntegrations('alice')).deliveries[0].status).toBe('sent');
  expect((await readIntegrations('bob')).deliveries[0].status).toBe('sent');
  await dispatchNotifications();
  expect(send).toHaveBeenCalledTimes(2);
});

it('queues explicit tests while disabled and enforces route authentication, idempotency and throttling', async () => {
  const context = { params: Promise.resolve({ channel: 'feishu' }) };
  const request = (key: string, user = 'alice') =>
    new Request('http://localhost/api/integrations/feishu/test', {
      method: 'POST',
      headers: { 'Idempotency-Key': key, ...(user ? { 'test-user': user } : {}) },
    });

  expect((await testEndpoint(request(randomUUID(), ''), context)).status).toBe(401);
  expect((await testEndpoint(request(randomUUID()), context)).status).toBe(400);
  const save = new Request('http://localhost/api/integrations/feishu', {
    method: 'PUT',
    headers: { 'test-user': 'alice', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, enabled: false }),
  });

  expect((await saveEndpoint(save, context)).status).toBe(200);
  const key = randomUUID();
  const first = await (await testEndpoint(request(key), context)).json();
  const second = await (await testEndpoint(request(key), context)).json();

  expect(first.deliveryId).toBe(second.deliveryId);
  expect((await testEndpoint(request(randomUUID()), context)).status).toBe(429);
  await expect(db.transaction((tx) => queueTest('feishu', 'bob', tx))).rejects.toThrow(
    '保存通知配置',
  );
  await dispatchNotifications();
  expect(send).toHaveBeenCalledTimes(1);
});

it('allows replacing credentials after encryption key rotation without exposing old secrets', async () => {
  await saveIntegration('feishu', input, 'alice');
  vi.stubEnv('TESTDOG_INTEGRATION_SECRET', 'new-integration-test-secret-at-least-32-characters');
  const view = (await readIntegrations('alice')).integrations[0];

  expect(view.configured).toBe(false);
  expect(view.configurationError).toContain('无法解密');
  await expect(
    saveIntegration('feishu', { version: 1, enabled: false, events: [] }, 'alice'),
  ).rejects.toThrow('完整配置');
  const saved = await saveIntegration('feishu', { ...input, version: 1 }, 'alice');

  expect(saved.configured).toBe(true);
  expect(saved.configurationError).toBeUndefined();
});
