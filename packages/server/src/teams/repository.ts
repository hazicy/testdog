import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@testdog/server/db';
import { authUsers, teams, teamMembers, teamInvitations } from '@testdog/server/db/schema';
import { WorkspaceError } from '@testdog/server/shared/errors';

type Identity = { id: string; email: string };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const teamId = z.uuid();
const name = z.string().trim().min(1).max(80);

export const teamCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name }),
  z.object({ action: z.literal('switch'), teamId: teamId.nullable() }),
  z.object({ action: z.literal('rename'), teamId, name }),
  z.object({ action: z.literal('invite'), teamId, email: z.email().trim().toLowerCase() }),
  z.object({ action: z.literal('revoke'), teamId, invitationId: z.uuid() }),
  z.object({ action: z.literal('accept'), token: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({
    action: z.literal('member'),
    teamId,
    userId: z.string().min(1),
    role: z.enum(['admin', 'member']),
  }),
  z.object({ action: z.literal('remove'), teamId, userId: z.string().min(1) }),
]);

export async function requireTeamMember(id: string, userId: string, tx: Tx | typeof db = db) {
  if (!teamId.safeParse(id).success) throw new WorkspaceError('团队不存在或无权访问。', 403);
  const [member] = await tx
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, userId)));

  if (!member) throw new WorkspaceError('团队不存在或无权访问。', 403);

  return member;
}

export async function listTeams(user: Identity, activeTeamId: string | null) {
  const memberships = await db
    .select({ id: teams.id, name: teams.name, role: teamMembers.role })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, user.id))
    .orderBy(teams.createdAt);
  const active = memberships.find((team) => team.id === activeTeamId);

  if (!active) return { teams: memberships, activeTeamId, members: [], invitations: [] };
  const members = await db
    .select({
      userId: teamMembers.userId,
      name: authUsers.name,
      email: authUsers.email,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(authUsers, eq(authUsers.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, active.id))
    .orderBy(authUsers.name);
  const invitations =
    active.role === 'admin'
      ? await db
          .select({
            id: teamInvitations.id,
            email: teamInvitations.email,
            expiresAt: teamInvitations.expiresAt,
          })
          .from(teamInvitations)
          .where(
            and(
              eq(teamInvitations.teamId, active.id),
              gt(teamInvitations.expiresAt, new Date().toISOString()),
            ),
          )
      : [];

  return { teams: memberships, activeTeamId: active.id, members, invitations };
}

export async function executeTeamCommand(user: Identity, raw: unknown) {
  const parsed = teamCommand.safeParse(raw);

  if (!parsed.success) throw new WorkspaceError('团队参数无效。');
  const input = parsed.data;

  return db.transaction(async (tx) => {
    if (input.action === 'create') {
      const [team] = await tx.insert(teams).values({ name: input.name }).returning();

      await tx.insert(teamMembers).values({ teamId: team.id, userId: user.id, role: 'admin' });

      return { activeTeamId: team.id };
    }

    if (input.action === 'accept') {
      const [invitation] = await tx
        .select()
        .from(teamInvitations)
        .where(
          eq(teamInvitations.tokenHash, createHash('sha256').update(input.token).digest('hex')),
        )
        .for('update');

      if (!invitation || Date.parse(invitation.expiresAt) <= Date.now())
        throw new WorkspaceError('邀请已失效，请联系团队管理员重新邀请。', 410);
      if (invitation.email !== user.email.toLowerCase())
        throw new WorkspaceError('请使用被邀请的邮箱登录后接受邀请。', 403);
      await tx
        .insert(teamMembers)
        .values({ teamId: invitation.teamId, userId: user.id, role: 'member' })
        .onConflictDoNothing();
      await tx.delete(teamInvitations).where(eq(teamInvitations.id, invitation.id));

      return { activeTeamId: invitation.teamId };
    }

    if (input.action === 'switch') {
      if (input.teamId) await requireTeamMember(input.teamId, user.id, tx);

      return { activeTeamId: input.teamId };
    }

    // Serialize administration so simultaneous requests cannot remove every administrator.
    await tx.select().from(teams).where(eq(teams.id, input.teamId)).for('update');
    const actor = await requireTeamMember(input.teamId, user.id, tx);
    const leaving = input.action === 'remove' && input.userId === user.id;

    if (actor.role !== 'admin' && !leaving)
      throw new WorkspaceError('仅团队管理员可执行此操作。', 403);
    if (input.action === 'rename') {
      await tx.update(teams).set({ name: input.name }).where(eq(teams.id, input.teamId));
    } else if (input.action === 'invite') {
      const existing = await tx
        .select({ email: authUsers.email })
        .from(teamMembers)
        .innerJoin(authUsers, eq(authUsers.id, teamMembers.userId))
        .where(and(eq(teamMembers.teamId, input.teamId), eq(authUsers.email, input.email)));

      if (existing.length) throw new WorkspaceError('该用户已是团队成员。', 409);
      const token = randomBytes(32).toString('hex');
      const values = {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      };

      await tx
        .insert(teamInvitations)
        .values({ ...values, teamId: input.teamId, email: input.email })
        .onConflictDoUpdate({
          target: [teamInvitations.teamId, teamInvitations.email],
          set: values,
        });

      return { invitationToken: token };
    } else if (input.action === 'revoke') {
      await tx
        .delete(teamInvitations)
        .where(
          and(eq(teamInvitations.id, input.invitationId), eq(teamInvitations.teamId, input.teamId)),
        );
    } else {
      const target = await requireTeamMember(input.teamId, input.userId, tx);

      if (target.role === 'admin' && (input.action === 'remove' || input.role !== 'admin')) {
        const admins = await tx
          .select()
          .from(teamMembers)
          .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.role, 'admin')));

        if (admins.length < 2) throw new WorkspaceError('请先指定另一位管理员。', 409);
      }

      const where = and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, input.userId));

      if (input.action === 'remove') await tx.delete(teamMembers).where(where);
      else await tx.update(teamMembers).set({ role: input.role }).where(where);
      if (leaving) return { activeTeamId: null };
    }

    return {};
  });
}
