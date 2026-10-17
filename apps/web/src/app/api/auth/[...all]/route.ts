import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/server/auth/auth';

export const runtime = 'nodejs';
const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export async function POST(request: Request) {
  const response = await handlers.POST(request);

  if (response.ok && new URL(request.url).pathname === '/api/auth/sign-out') {
    const cleared = new Response(response.body, response);

    cleared.headers.append(
      'Set-Cookie',
      'testdog_team=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    );

    return cleared;
  }

  return response;
}
