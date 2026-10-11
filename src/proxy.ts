import { NextResponse, type NextRequest } from 'next/server';
import { workspaceAuthorized } from './server/shared/auth';

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (
    path === '/' ||
    path === '/login' ||
    path === '/register' ||
    path === '/api/auth' ||
    path.startsWith('/api/auth/')
  )
    return NextResponse.next();
  if (!(await workspaceAuthorized(request))) {
    if (path === '/api' || path.startsWith('/api/'))
      return NextResponse.json(
        { success: false, message: '请先登录' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    const url = new URL('/login', request.url);

    url.searchParams.set('callbackURL', path + request.nextUrl.search);

    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/register',
    '/onboarding/:path*',
    '/cases/:path*',
    '/runs/:path*',
    '/issues/:path*',
    '/integrations/:path*',
    '/settings/:path*',
    '/api/:path*',
  ],
};
