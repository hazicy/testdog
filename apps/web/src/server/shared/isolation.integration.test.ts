import { defaultWebTarget } from '@testdog/contracts/automation/platform/target';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';

const fixture = vi.hoisted(() => ({
  database: undefined as
    | Awaited<ReturnType<typeof import('@testdog/server/testing/testDatabase').createTestDatabase>>
    | undefined,
  auth: undefined as
    | {
        handler: (request: Request) => Promise<Response>;
        api: { getSession: typeof import('@/server/auth/auth').auth.api.getSession };
      }
    | undefined,
}));

vi.mock('@testdog/server/db', async () => {
  fixture.database = await (
    await import('@testdog/server/testing/testDatabase')
  ).createTestDatabase();

  return { db: fixture.database.db };
});
vi.mock('@/server/auth/auth', () => ({
  get auth() {
    return fixture.auth;
  },
}));

import { db } from '@testdog/server/db';
import {
  authUsers,
  authSessions,
  authAccounts,
  authVerifications,
  testCases,
  testRuns,
  runArtifacts,
} from '@testdog/server/db/schema';
import { GET as listTests, POST as createTest } from '@/app/api/tests/route';
import { PATCH as editTest, DELETE as deleteTest } from '@/app/api/tests/[id]/route';
import { GET as listRuns, POST as createRun } from '@/app/api/runs/route';
import { GET as getRun, DELETE as cancelRun } from '@/app/api/runs/[id]/route';
import { GET as getLogs } from '@/app/api/runs/[id]/logs/route';
import { GET as getUsage } from '@/app/api/runs/[id]/model-usage/route';
import { GET as getModelCall } from '@/app/api/runs/[id]/model-usage/[callId]/route';
import { GET as getPreview } from '@/app/api/runs/[id]/preview/route';
import {
  GET as getArtifact,
  HEAD as headArtifact,
} from '@/app/api/runs/[id]/artifacts/[artifactId]/route';
import { GET as getRecording, POST as saveRecording } from '@/app/api/runs/[id]/recording/route';
import { GET as getRunEvents } from '@/app/api/runs/[id]/events/route';
import { GET as getWorkspaceEvents } from '@/app/api/events/route';
import { GET as getStats } from '@/app/api/workspace/stats/route';
import { POST as createBatch } from '@/app/api/run-batches/route';
import { workspaceVersion } from '@/server/realtime/eventStream';
import { eq } from 'drizzle-orm';
import { requireUserId } from '@/server/shared/auth';

type Account = { id: string; cookie: string };
let alice: Account, bob: Account;
const input = {
  name: 'Private test',
  goal: 'Private goal',
  url: 'https://example.com',
  tags: ['private'],
};
const context = (id: string) => ({ params: Promise.resolve({ id }) });

function request(path: string, account?: Account, body?: object, key?: string, method?: string) {
  return new Request('http://localhost:3000' + path, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: {
      'content-type': 'application/json',
      ...(account ? { cookie: account.cookie } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeAll(async () => {
  vi.stubEnv('CASEFORGE_ALLOW_UNAUTHENTICATED', '');
  fixture.auth = betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'isolation-integration-secret-with-at-least-32-characters',
    database: drizzleAdapter(fixture.database!.db, {
      provider: 'pg',
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
  });

  async function register(name: string): Promise<Account> {
    const response = await fixture.auth!.handler(
      new Request('http://localhost:3000/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ name, email: name + '@example.com', password: 'correct-password' }),
      }),
    );

    expect(response.status).toBe(200);

    return {
      id: (await response.json()).user.id,
      cookie: response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; '),
    };
  }

  alice = await register('alice');
  bob = await register('bob');
}, 30000);
beforeEach(async () => {
  await fixture.database!.client.exec(
    'TRUNCATE test_cases, test_runs, submission_requests, realtime_outbox CASCADE',
  );
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await fixture.database?.client.close();
});

async function ownedRun(account: Account) {
  const created = await createTest(
    request('/api/tests', account, { ...input, userId: account === alice ? bob.id : alice.id }),
  );

  expect(created.status).toBe(201);
  const { test: saved } = await created.json();

  expect(saved.userId).toBe(account.id);
  const response = await createRun(request('/api/runs', account, { testId: saved.id }));

  expect(response.status).toBe(202);

  return { saved, run: (await response.json()).run };
}

test('uses real sessions to isolate lists, latest status, searches, pagination, statistics and legacy data', async () => {
  const a = await ownedRun(alice);
  const b = await ownedRun(bob);

  await db.insert(testCases).values({
    name: 'Unassigned',
    goal: input.goal,
    tags: input.tags,
    target: defaultWebTarget(input.url),
  });
  await db.insert(testRuns).values({
    name: 'Unassigned',
    goal: 'Legacy',
    targetSnapshot: defaultWebTarget(input.url),
    status: 'queued',
  });
  const [cases, runs, stats] = await Promise.all([
    listTests(request('/api/tests?q=private&limit=1', alice)),
    listRuns(request('/api/runs?q=Private&limit=1', alice)),
    getStats(request('/api/workspace/stats', alice)),
  ]);

  expect((await cases.json()).tests.map((row: { id: string }) => row.id)).toEqual([a.saved.id]);
  expect((await runs.json()).runs.map((row: { id: string }) => row.id)).toEqual([a.run.id]);
  expect(await stats.json()).toMatchObject({ testCount: 1, runCount: 1, counts: { queued: 1 } });
  expect(
    (await (await listTests(request('/api/tests', bob))).json()).tests.map(
      (row: { id: string }) => row.id,
    ),
  ).toEqual([b.saved.id]);
  // Even an inconsistent foreign run reference cannot influence another user's latest status.
  await db.insert(testRuns).values({
    userId: bob.id,
    testId: a.saved.id,
    name: 'Foreign',
    targetSnapshot: defaultWebTarget(input.url),
    goal: 'Foreign',
    status: 'passed',
    startedAt: '2099-01-01T00:00:00Z',
  });
  expect(
    (await (await listTests(request('/api/tests?status=passed', alice))).json()).tests,
  ).toEqual([]);
  expect(
    (await (await listTests(request('/api/tests?status=queued', alice))).json()).latestRuns[0].id,
  ).toBe(a.run.id);
  const foreignPage = await (await listRuns(request('/api/runs?limit=1', bob))).json();

  expect(
    (
      await (
        await listRuns(request('/api/runs?limit=1&cursor=' + foreignPage.nextCursor, alice))
      ).json()
    ).runs.every((row: { id: string }) => row.id === a.run.id),
  ).toBe(true);
});

test('returns 404 for cross-user reads, writes, evidence, logs, recording versions, replay, batches and streams', async () => {
  const { saved, run } = await ownedRun(alice);
  const artifactId = randomUUID();

  await db.insert(runArtifacts).values({
    id: artifactId,
    runId: run.id,
    kind: 'screenshot',
    stage: 'after',
    pageId: 'page-1',
    pageUrl: input.url,
    capturedAt: new Date().toISOString(),
    elapsedMs: 1,
    path: '/private/alice-evidence.jpg',
    contentType: 'image/jpeg',
    size: 10,
  });
  const foreign = request('/api/runs/' + run.id + '?kind=console', bob);

  for (const handler of [getRun, getLogs, getUsage, getPreview, getRecording, getRunEvents]) {
    expect((await handler(foreign, context(run.id))).status).toBe(404);
  }

  expect(
    (await getModelCall(foreign, { params: Promise.resolve({ id: run.id, callId: randomUUID() }) }))
      .status,
  ).toBe(404);

  for (const handler of [getArtifact, headArtifact]) {
    expect(
      (await handler(foreign, { params: Promise.resolve({ id: run.id, artifactId }) })).status,
    ).toBe(404);
  }

  expect(
    (
      await editTest(
        request('/api/tests/' + saved.id, bob, input, undefined, 'PATCH'),
        context(saved.id),
      )
    ).status,
  ).toBe(404);
  expect((await deleteTest(foreign, context(saved.id))).status).toBe(404);
  expect((await cancelRun(foreign, context(run.id))).status).toBe(404);
  expect(
    (
      await saveRecording(
        request('/api/runs/' + run.id + '/recording', bob, {
          code: 'await page1.goto("https://example.com");',
        }),
        context(run.id),
      )
    ).status,
  ).toBe(404);
  expect((await createRun(request('/api/runs', bob, { testId: saved.id }))).status).toBe(404);
  expect(
    (
      await createBatch(
        request('/api/run-batches', bob, {
          testId: saved.id,
          variants: [
            {
              target: {
                platform: 'web',
                url: input.url,
                browser: 'chromium',
                deviceProfile: 'Pixel 7',
              },
            },
          ],
        }),
      )
    ).status,
  ).toBe(404);
  await db.update(testRuns).set({ status: 'failed' }).where(eq(testRuns.id, run.id));
  const ownVersion = await saveRecording(
    request('/api/runs/' + run.id + '/recording', alice, {
      code: 'await page1.goto("https://example.com");',
    }),
    context(run.id),
  );

  expect(ownVersion.status).toBe(201);
  const version = (await ownVersion.json()).version;

  expect(
    (
      await createRun(
        request('/api/runs', bob, {
          mode: 'replay',
          sourceRunId: run.id,
          recordingVersionId: version.id,
        }),
      )
    ).status,
  ).toBe(404);
  const replay = await createRun(
    request('/api/runs', alice, {
      mode: 'replay',
      sourceRunId: run.id,
      recordingVersionId: version.id,
    }),
  );

  expect(replay.status).toBe(202);
  expect((await db.select().from(testRuns)).every((row) => row.userId === alice.id)).toBe(true);
  expect((await getRun(request('/api/runs/' + run.id, alice), context(run.id))).status).toBe(200);
  expect(
    (await getRecording(request('/api/runs/' + run.id + '/recording', alice), context(run.id)))
      .status,
  ).toBe(200);
});

test('scopes idempotency keys to users and excludes foreign events from workspace versions', async () => {
  const key = randomUUID();
  const payload = { case: 'Same submission', url: input.url };
  const [a, retry, b] = await Promise.all([
    createRun(request('/api/runs', alice, payload, key)),
    createRun(request('/api/runs', alice, payload, key)),
    createRun(request('/api/runs', bob, payload, key)),
  ]);
  const [first, duplicate, other] = await Promise.all([a.json(), retry.json(), b.json()]);

  expect(first.run.id).toBe(duplicate.run.id);
  expect(first.run.id).not.toBe(other.run.id);
  const before = await workspaceVersion(alice.id);
  const bVersion = await workspaceVersion(bob.id);

  await createTest(request('/api/tests', bob, input));
  expect(await workspaceVersion(alice.id)).toBe(before);
  expect(await workspaceVersion(bob.id)).not.toBe(bVersion);
  const own = await createTest(request('/api/tests', alice, input));
  const saved = (await own.json()).test;
  const withCase = await workspaceVersion(alice.id);

  expect(withCase).not.toBe(before);
  await deleteTest(request('/api/tests/' + saved.id, alice), context(saved.id));
  expect(await workspaceVersion(alice.id)).not.toBe(withCase);
  expect(
    (
      await fixture.database!.client.query<{ userId: string }>(
        'SELECT "userId" FROM realtime_outbox WHERE summary',
      )
    ).rows.every((row) => row.userId === alice.id || row.userId === bob.id),
  ).toBe(true);
});

test('requires authentication at route level and only exposes unassigned records in explicit local mode', async () => {
  expect((await listTests(request('/api/tests'))).status).toBe(401);
  expect(
    (await createRun(request('/api/runs', undefined, { case: 'Anonymous', url: input.url })))
      .status,
  ).toBe(401);
  expect((await getWorkspaceEvents(request('/api/events'))).status).toBe(401);
  await ownedRun(alice);
  await db.insert(testCases).values({
    name: 'Unassigned',
    goal: input.goal,
    tags: input.tags,
    target: defaultWebTarget(input.url),
  });
  vi.stubEnv('CASEFORGE_ALLOW_UNAUTHENTICATED', 'true');
  try {
    expect(
      (await (await listTests(request('/api/tests'))).json()).tests.map(
        (row: { name: string }) => row.name,
      ),
    ).toEqual(['Unassigned']);
    expect(await requireUserId(request('/api/tests', alice))).toBe(alice.id);
    expect(
      (await (await listTests(request('/api/tests', alice))).json()).tests.map(
        (row: { name: string }) => row.name,
      ),
    ).toEqual(['Private test']);
  } finally {
    vi.stubEnv('CASEFORGE_ALLOW_UNAUTHENTICATED', '');
  }
});
