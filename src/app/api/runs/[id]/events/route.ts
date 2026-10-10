import { eventStream } from '@/server/realtime/eventStream';
import { apiError, validId } from '@/server/shared/http';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    validId(id);

    return await eventStream(request, id);
  } catch (error) {
    return apiError(error);
  }
}
