import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { defaultWebTarget } from '@testdog/contracts/automation/platform/target';

const fixture = vi.hoisted(() => ({
  database: undefined as
    | Awaited<ReturnType<typeof import('@testdog/server/testing/testDatabase').createTestDatabase>>
    | undefined,
}));

vi.mock('@testdog/server/db', async () => {
  fixture.database = await (
    await import('@testdog/server/testing/testDatabase')
  ).createTestDatabase();

  return { db: fixture.database.db };
});
vi.mock('@/server/auth/auth', () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get('x-test-user');

        return id ? { user: { id, email: `${id}@example.com` } } : null;
      },
    },
  },
}));
import { db } from '@testdog/server/db';
import {
  authUsers,
  testRuns,
  notificationIntegrations,
  notificationDeliveries,
  realtimeOutbox,
} from '@testdog/server/db/schema';
import { executeTeamCommand, listTeams } from '@testdog/server/teams/repository';
import { createRun } from '@testdog/server/runs/submission';
import { getRun } from '@testdog/server/runs/repository';
import { getTest, saveTest } from '@testdog/server/test-cases/repository';
import { ownershipValues, ownedBy, teamScope } from '@testdog/server/shared/ownership';
import { encryptSecret, decryptSecret } from '@testdog/server/shared/secrets';
import { requireUserId } from '@/server/shared/auth';
import { POST } from '@/app/api/teams/route';

const alice = { id: 'alice', email: 'alice@example.com' };
const bob = { id: 'bob', email: 'bob@example.com' };
const eve = { id: 'eve', email: 'eve@example.com' };
const input = { name: 'Shared', goal: 'Check', url: 'https://example.com', tags: [] };

function request(user: string, team?: string, body?: object, origin = 'http://localhost:3000') {
  return new Request('http://localhost:3000/api/teams', {
    method: body ? 'POST' : 'GET',
    headers: {
      'x-test-user': user,
      cookie: team ? `testdog_team=${team}` : '',
      origin,
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeAll(async () => {
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
  vi.stubEnv('BETTER_AUTH_SECRET', 'team-test-secret-at-least-32-characters');
  for (const user of [alice, bob, eve])
    await db.insert(authUsers).values({ ...user, name: user.id });
});
afterAll(async () => {
  await fixture.database?.client.close();
  vi.unstubAllEnvs();
});

test('shares one team workspace while isolating personal, legacy and other team data', async () => {
  const { activeTeamId: id } = await executeTeamCommand(alice, { action: 'create', name: 'QA' });
  const { activeTeamId: other } = await executeTeamCommand(eve, {
    action: 'create',
    name: 'Other',
  });
  const invitation = await executeTeamCommand(alice, {
    action: 'invite',
    teamId: id,
    email: bob.email,
  });

  await expect(
    executeTeamCommand(eve, { action: 'accept', token: invitation.invitationToken }),
  ).rejects.toMatchObject({ status: 403 });
  await executeTeamCommand(bob, { action: 'accept', token: invitation.invitationToken });
  await expect(
    executeTeamCommand(bob, { action: 'accept', token: invitation.invitationToken }),
  ).rejects.toMatchObject({ status: 410 });
  const scope = await requireUserId(request('bob', id!));

  expect(scope).toBe(teamScope(id!));
  const shared = await saveTest(input, undefined, scope);
  const run = await db.transaction((tx) => createRun({ testId: shared.id }, tx, scope));

  expect((await getRun(run.id, { userId: scope })).id).toBe(run.id);
  await expect(getRun(run.id, { userId: 'alice' })).rejects.toMatchObject({ status: 404 });
  await expect(getRun(run.id, { userId: teamScope(other!) })).rejects.toMatchObject({
    status: 404,
  });

  const personal = await saveTest({ ...input, name: 'Personal' }, undefined, 'alice');

  expect((await getTest(shared.id, await requireUserId(request('alice', id!)))).name).toBe(
    'Shared',
  );
  await saveTest({ ...input, name: 'Edited by Bob' }, shared.id, scope);
  expect((await getTest(shared.id, teamScope(id!))).name).toBe('Edited by Bob');
  for (const denied of ['alice', null, teamScope(other!)])
    await expect(getTest(shared.id, denied)).rejects.toMatchObject({ status: 404 });
  await expect(getTest(personal.id, scope)).rejects.toMatchObject({ status: 404 });
  await expect(requireUserId(request('eve', id!))).rejects.toMatchObject({ status: 403 });
  await expect(
    executeTeamCommand(bob, { action: 'invite', teamId: id, email: eve.email }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    executeTeamCommand(alice, { action: 'remove', teamId: id, userId: alice.id }),
  ).rejects.toMatchObject({ status: 409 });
  await executeTeamCommand(alice, { action: 'member', teamId: id, userId: bob.id, role: 'admin' });
  await executeTeamCommand(bob, { action: 'remove', teamId: id, userId: alice.id });
  await expect(requireUserId(request('alice', id!))).rejects.toMatchObject({ status: 403 });
  expect((await listTeams(alice, null)).teams).toHaveLength(0);
  const outbox = await db.select().from(realtimeOutbox).where(ownedBy(realtimeOutbox, scope));

  expect(outbox.length).toBeGreaterThan(0);
  expect(outbox.every((row) => row.teamId === id && row.userId === null)).toBe(true);
});

test('revokes and expires invitations, and replaces old invitation links', async () => {
  const { activeTeamId: id } = await executeTeamCommand(alice, {
    action: 'create',
    name: 'Invites',
  });
  const first = await executeTeamCommand(alice, { action: 'invite', teamId: id, email: bob.email });
  const second = await executeTeamCommand(alice, {
    action: 'invite',
    teamId: id,
    email: bob.email,
  });

  await expect(
    executeTeamCommand(bob, { action: 'accept', token: first.invitationToken }),
  ).rejects.toMatchObject({ status: 410 });
  const listing = await listTeams(alice, id!);

  await executeTeamCommand(alice, {
    action: 'revoke',
    teamId: id,
    invitationId: listing.invitations[0].id,
  });
  await expect(
    executeTeamCommand(bob, { action: 'accept', token: second.invitationToken }),
  ).rejects.toMatchObject({ status: 410 });
  const third = await executeTeamCommand(alice, { action: 'invite', teamId: id, email: bob.email });

  await fixture.database!.client.exec(
    'UPDATE team_invitations SET "expiresAt" = now() - interval \'1 day\'',
  );
  await expect(
    executeTeamCommand(bob, { action: 'accept', token: third.invitationToken }),
  ).rejects.toMatchObject({ status: 410 });
});

test('keeps team notification routing and encrypted integration credentials isolated', async () => {
  const { activeTeamId: id } = await executeTeamCommand(alice, {
    action: 'create',
    name: 'Notifications',
  });
  const { activeTeamId: other } = await executeTeamCommand(eve, {
    action: 'create',
    name: 'Other notifications',
  });
  const scope = teamScope(id!);
  const encrypted = encryptSecret({ secret: 'shared' }, scope, 'email');

  expect(decryptSecret(encrypted, scope, 'email')).toEqual({ secret: 'shared' });
  expect(() => decryptSecret(encrypted, teamScope(other!), 'email')).toThrow();
  for (const owner of [scope, teamScope(other!), null, alice.id])
    await db.insert(notificationIntegrations).values({
      ...ownershipValues(owner),
      channel: 'email',
      enabled: true,
      events: ['run.failed'],
      encryptedConfig: encrypted,
    });
  const [run] = await db
    .insert(testRuns)
    .values({
      ...ownershipValues(scope),
      name: 'Failed run',
      goal: 'Check',
      targetSnapshot: defaultWebTarget('https://example.com'),
      status: 'queued',
    })
    .returning();

  await fixture.database!.client.query("UPDATE test_runs SET status='failed' WHERE id=$1", [
    run.id,
  ]);
  const deliveries = await db
    .select({ teamId: notificationIntegrations.teamId })
    .from(notificationDeliveries)
    .innerJoin(
      notificationIntegrations,
      eq(notificationIntegrations.id, notificationDeliveries.integrationId),
    );

  expect(deliveries).toEqual([{ teamId: id }]);
});

test('protects workspace switching from forged membership and cross-origin requests', async () => {
  const { activeTeamId: id } = await executeTeamCommand(alice, {
    action: 'create',
    name: 'Switch',
  });

  expect((await POST(request('eve', undefined, { action: 'switch', teamId: id }))).status).toBe(
    403,
  );
  expect(
    (
      await POST(
        request('alice', undefined, { action: 'switch', teamId: id }, 'https://evil.example'),
      )
    ).status,
  ).toBe(403);
  const response = await POST(request('alice', undefined, { action: 'switch', teamId: id }));

  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toContain(`testdog_team=${id}`);
  expect((await POST(request('alice', undefined, { action: 'create', name: '' }))).status).toBe(
    400,
  );
  const personal = await POST(request('alice', id!, { action: 'switch', teamId: null }));

  expect(personal.headers.get('set-cookie')).toContain('Max-Age=0');
});

test('rejects stale browser documents and realtime reconnects after a workspace switch', async () => {
  const { activeTeamId: id } = await executeTeamCommand(alice, {
    action: 'create',
    name: 'Fresh workspace',
  });
  const stale = request('alice', id!);

  stale.headers.set('x-testdog-workspace', 'personal');
  await expect(requireUserId(stale)).rejects.toMatchObject({ status: 409 });
  const stream = new Request('http://localhost:3000/api/events?workspace=personal', {
    headers: { 'x-test-user': 'alice', cookie: `testdog_team=${id}` },
  });

  await expect(requireUserId(stream)).rejects.toMatchObject({ status: 409 });
});
