import { auth } from '@/server/auth/auth';
import { WorkspaceError } from '@testdog/server/shared/errors';

export const teamCookie = 'testdog_team';

export function selectedTeam(request: Request) {
  const value = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(teamCookie + '='))
    ?.slice(teamCookie.length + 1);

  return value || null;
}

export async function requireIdentity(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) throw new WorkspaceError('请先登录', 401);

  return session.user;
}
