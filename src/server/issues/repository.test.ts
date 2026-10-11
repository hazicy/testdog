import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';

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
import {
  authUsers,
  issues,
  issueOccurrences,
  issueEvents,
  issueVerifications,
  testCases,
  testRuns,
  runSteps,
  runArtifacts,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  createIssue,
  getIssue,
  linkOccurrence,
  listIssues,
  startVerification,
  updateIssue,
} from './repository';
import { issueInput } from '@/features/issues/schemas';
import { POST as createEndpoint } from '@/app/api/issues/route';
import { POST as verifyEndpoint } from '@/app/api/issues/[id]/verifications/route';
import { GET as detailEndpoint } from '@/app/api/issues/[id]/route';

beforeEach(async () => {
  await isolated.client!.exec(
    'TRUNCATE auth_users, test_cases, test_runs, issues, submission_requests CASCADE',
  );
  await db.insert(authUsers).values([
    { id: 'alice', name: 'Alice', email: 'alice@example.com' },
    { id: 'bob', name: 'Bob', email: 'bob@example.com' },
  ]);
});
afterAll(() => isolated.client!.close());

async function fixture(userId = 'alice') {
  const [test] = await db
    .insert(testCases)
    .values({
      userId,
      name: '订单',
      goal: '确认金额',
      url: 'https://example.com',
      plan: {
        rootId: 'amount',
        nodes: {
          amount: {
            id: 'amount',
            kind: 'task',
            actionType: 'assert',
            goal: '金额为100',
            dependsOn: [],
            requirementIds: [],
            assertions: [{ description: '金额为100' }],
          },
        },
      },
    })
    .returning();
  const [run] = await db
    .insert(testRuns)
    .values({
      userId,
      testId: test.id,
      name: test.name,
      goal: test.goal,
      url: test.url,
      plan: test.plan,
      status: 'failed',
    })
    .returning();
  const [step] = await db
    .insert(runSteps)
    .values({
      id: randomUUID(),
      runId: run.id,
      sequence: 1,
      kind: 'assertion',
      title: '金额为100',
      assertion: { description: '金额为100' },
      planNodeId: 'amount',
      status: 'failed',
      startedAt: run.startedAt,
      pageId: 'page',
      pageUrl: run.url,
      error: '实际为120',
    })
    .returning();

  await db.insert(runArtifacts).values({
    id: randomUUID(),
    runId: run.id,
    stepId: step.id,
    kind: 'screenshot',
    stage: 'after',
    pageId: 'page',
    pageUrl: run.url,
    capturedAt: run.startedAt,
    elapsedMs: 1000,
    path: '/private/evidence.png',
    contentType: 'image/png',
    size: 20,
  });

  return { run, step, test };
}

async function fromFixture(source: Awaited<ReturnType<typeof fixture>>) {
  return db.transaction((tx) =>
    createIssue(
      issueInput.parse({
        title: '金额错误',
        source: { runId: source.run.id, stepId: source.step.id },
      }),
      'alice',
      tx,
    ),
  );
}

it('creates immutable evidence snapshots and rejects foreign executions or mismatched steps atomically', async () => {
  const source = await fixture();
  const issue = await fromFixture(source);
  const foreign = await fixture('bob');
  const detail = await getIssue(issue.id, 'alice');

  expect(detail.occurrences[0].snapshot).toMatchObject({
    name: '订单',
    step: { error: '实际为120' },
    artifacts: [{ kind: 'screenshot' }],
  });
  expect(JSON.stringify(detail)).not.toContain('/private/evidence.png');
  await db.update(testCases).set({ name: '新名称' }).where(eq(testCases.id, source.test.id));
  expect((await getIssue(issue.id, 'alice')).occurrences[0].snapshot.name).toBe('订单');
  await expect(getIssue(issue.id, 'bob')).rejects.toMatchObject({ status: 404 });
  await expect(fromFixture(foreign)).rejects.toMatchObject({ status: 404 });
  await expect(
    linkOccurrence(issue.id, { runId: source.run.id, stepId: foreign.step.id }, 'alice'),
  ).rejects.toMatchObject({ status: 404 });
  expect(await db.select().from(issues)).toHaveLength(1);
  expect(await db.select().from(issueOccurrences)).toHaveLength(1);
});

it('deduplicates links, validates closure and prevents stale updates from losing comments', async () => {
  const source = await fixture();
  const issue = await fromFixture(source);

  await linkOccurrence(issue.id, { runId: source.run.id, stepId: source.step.id }, 'alice');
  await linkOccurrence(issue.id, { runId: source.run.id }, 'alice');
  await linkOccurrence(issue.id, { runId: source.run.id }, 'alice');
  expect(await db.select().from(issueOccurrences)).toHaveLength(2);
  const current = (await getIssue(issue.id, 'alice')).issue;

  await expect(
    updateIssue(issue.id, { version: current.version, status: 'closed' }, 'alice'),
  ).rejects.toThrow('关闭原因');
  const closed = await updateIssue(
    issue.id,
    { version: current.version, status: 'closed', closeReason: 'fixed', comment: '已修复金额计算' },
    'alice',
  );

  await expect(
    updateIssue(issue.id, { version: current.version, comment: '旧页面操作' }, 'alice'),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await db.select().from(issueEvents)).filter((item) => item.message === '旧页面操作'),
  ).toHaveLength(0);
  const reopened = await updateIssue(
    issue.id,
    { version: closed.version, status: 'open' },
    'alice',
  );

  expect(reopened.closeReason).toBeNull();
});

it('isolates searchable paginated lists and rejects invalid filters', async () => {
  const source = await fixture();
  const issue = await fromFixture(source);

  await db.transaction((tx) => createIssue(issueInput.parse({ title: 'Bob issue' }), 'bob', tx));
  await db.transaction((tx) =>
    createIssue(issueInput.parse({ title: 'Second issue' }), 'alice', tx),
  );
  const page = { limit: 1, q: '', status: 'all', cursor: undefined };
  const first = await listIssues(page, 'alice');

  expect(first.issues).toHaveLength(1);
  expect(first.nextCursor).toBeTruthy();
  const cursor = JSON.parse(Buffer.from(first.nextCursor!, 'base64url').toString());
  const second = await listIssues({ ...page, cursor }, 'alice');

  expect(second.issues[0].id).toBe(issue.id);
  expect(second.nextCursor).toBeNull();
  expect((await listIssues({ ...page, q: '金额' }, 'alice')).issues[0].id).toBe(issue.id);
  expect((await listIssues({ ...page, q: 'Bob' }, 'alice')).issues).toEqual([]);
  await expect(listIssues({ ...page, status: '__proto__' }, 'alice')).rejects.toThrow('状态无效');
});

it('creates verification and queue entry together and reports unexecuted targets as inconclusive', async () => {
  const source = await fixture();
  const issue = await fromFixture(source);
  const occurrence = (await getIssue(issue.id, 'alice')).occurrences[0];
  const run = await db.transaction((tx) =>
    startVerification(issue.id, { occurrenceId: occurrence.id }, 'alice', tx),
  );

  expect(run.status).toBe('queued');
  expect((await getIssue(issue.id, 'alice')).issue.status).toBe('pending_verification');
  await expect(
    db.transaction((tx) =>
      startVerification(issue.id, { occurrenceId: occurrence.id }, 'alice', tx),
    ),
  ).rejects.toMatchObject({ status: 409 });
  await db.update(testRuns).set({ status: 'passed' }).where(eq(testRuns.id, run.id));
  expect((await getIssue(issue.id, 'alice')).verifications[0].outcome).toBe('inconclusive');
  await db
    .insert(runSteps)
    .values({ ...source.step, id: randomUUID(), runId: run.id, status: 'passed', error: null });
  const verified = await getIssue(issue.id, 'alice');

  expect(verified.verifications[0].outcome).toBe('passed');
  expect(verified.issue.status).toBe('pending_verification');
  await db.delete(testCases).where(eq(testCases.id, source.test.id));
  const count = (await db.select().from(testRuns)).length;

  await expect(
    db.transaction((tx) =>
      startVerification(issue.id, { occurrenceId: occurrence.id }, 'alice', tx),
    ),
  ).rejects.toThrow('用例不存在');
  expect(await db.select().from(testRuns)).toHaveLength(count);
  expect(await db.select().from(issueVerifications)).toHaveLength(1);
});

it('enforces authentication, ownership, input validation and idempotency through HTTP routes', async () => {
  const source = await fixture();
  const key = randomUUID();
  const body = { title: 'API issue', source: { runId: source.run.id, stepId: source.step.id } };
  const request = (user = 'alice', payload = body) =>
    new Request('http://localhost/api/issues', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
        ...(user ? { 'test-user': user } : {}),
      },
      body: JSON.stringify(payload),
    });

  expect((await createEndpoint(request(''))).status).toBe(401);
  expect((await createEndpoint(request('bob'))).status).toBe(404);
  const response = await createEndpoint(request());
  const { issue } = await response.json();

  expect(response.status).toBe(201);
  expect((await (await createEndpoint(request())).json()).issue.id).toBe(issue.id);
  expect((await createEndpoint(request('alice', { ...body, title: 'changed' }))).status).toBe(409);
  const context = { params: Promise.resolve({ id: issue.id }) };

  expect(
    (
      await detailEndpoint(
        new Request('http://localhost', { headers: { 'test-user': 'bob' } }),
        context,
      )
    ).status,
  ).toBe(404);
  const occurrence = (await getIssue(issue.id, 'alice')).occurrences[0];
  const verifyKey = randomUUID();
  const verifyRequest = () =>
    new Request(`http://localhost/api/issues/${issue.id}/verifications`, {
      method: 'POST',
      headers: {
        'test-user': 'alice',
        'Content-Type': 'application/json',
        'Idempotency-Key': verifyKey,
      },
      body: JSON.stringify({ occurrenceId: occurrence.id }),
    });
  const one = await (await verifyEndpoint(verifyRequest(), context)).json();
  const two = await (await verifyEndpoint(verifyRequest(), context)).json();

  expect(two.run.id).toBe(one.run.id);
  expect(await db.select().from(issueVerifications)).toHaveLength(1);
});
