import { NextResponse } from 'next/server';
import { executeTeamCommand, listTeams } from '@testdog/server/teams/repository';
import { apiError } from '@testdog/server/shared/http';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { requireIdentity, selectedTeam, teamCookie } from '@/server/shared/team';

export async function GET(request: Request) {
  try {
    return NextResponse.json(
      await listTeams(await requireIdentity(request), selectedTeam(request)),
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    const expected = new URL(process.env.BETTER_AUTH_URL || request.url).origin;

    if (origin !== expected) throw new WorkspaceError('请求来源无效。', 403);
    const result = await executeTeamCommand(await requireIdentity(request), await request.json());
    const response = NextResponse.json(result);

    if ('activeTeamId' in result)
      response.cookies.set(teamCookie, result.activeTeamId || '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: new URL(expected).protocol === 'https:',
        path: '/',
        maxAge: result.activeTeamId ? 365 * 86400 : 0,
      });

    return response;
  } catch (error) {
    return apiError(error);
  }
}
