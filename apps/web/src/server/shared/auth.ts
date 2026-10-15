import { auth } from '@/server/auth/auth';
import { WorkspaceError } from '@testdog/server/shared/errors';
import type { UserScope } from '@testdog/server/shared/ownership';

export async function requireUserId(request: Request): Promise<UserScope> {
  const session = await auth.api.getSession({ headers: request.headers });

  if (session) return session.user.id;
  if (process.env.TESTDOG_ALLOW_UNAUTHENTICATED === 'true') return null;
  throw new WorkspaceError('请先登录', 401);
}

export async function workspaceAuthorized(request: Request): Promise<boolean> {
  // Explicit escape hatch for isolated UI tests and controlled local deployments.
  if (process.env.TESTDOG_ALLOW_UNAUTHENTICATED === 'true') return true;
  const session = await auth.api.getSession({ headers: request.headers });

  return !!session;
}
