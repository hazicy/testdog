import { requireUserId } from '@/server/shared/auth';
import { apiError } from '@/server/shared/http';
import { eventStream } from '@/server/realtime/eventStream';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    return await eventStream(request, undefined, await requireUserId(request));
  } catch (error) {
    return apiError(error);
  }
}
