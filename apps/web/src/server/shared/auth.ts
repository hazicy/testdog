import { selectedTeam } from '@/server/shared/team';
import { requireTeamMember } from '@testdog/server/teams/repository';
import { teamScope } from '@testdog/server/shared/ownership';
import { auth } from '@/server/auth/auth';
import { WorkspaceError } from '@testdog/server/shared/errors';
import type { UserScope } from '@testdog/server/shared/ownership';

export async function requireUserId(request: Request): Promise<UserScope> {
  const session = await auth.api.getSession({ headers: request.headers });

  if (session) {
    const teamId = selectedTeam(request);
    const expected =
      request.headers.get('x-testdog-workspace') ||
      new URL(request.url).searchParams.get('workspace');

    if (expected && expected !== (teamId || 'personal'))
      throw new WorkspaceError('工作区已切换，请刷新页面。', 409);

    if (teamId) {
      await requireTeamMember(teamId, session.user.id);

      return teamScope(teamId);
    }

    return session.user.id;
  }

  if (process.env.TESTDOG_ALLOW_UNAUTHENTICATED === 'true') return null;
  throw new WorkspaceError('请先登录', 401);
}

export async function workspaceAuthorized(request: Request): Promise<boolean> {
  // Explicit escape hatch for isolated UI tests and controlled local deployments.
  if (process.env.TESTDOG_ALLOW_UNAUTHENTICATED === 'true') return true;
  const session = await auth.api.getSession({ headers: request.headers });

  return !!session;
}
