import { NextResponse, type NextRequest } from 'next/server';
import { workspaceAuthorized } from './workspace/auth';

export function proxy(request: NextRequest) {
  if (!workspaceAuthorized(request))
    return new NextResponse('Workspace authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="CaseForge", charset="UTF-8"',
        'Cache-Control': 'no-store',
      },
    });
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
