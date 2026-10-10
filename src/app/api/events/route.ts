import { eventStream } from '@/server/realtime/eventStream';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    return await eventStream(request);
  } catch {
    return Response.json({ message: '实时连接暂不可用' }, { status: 503 });
  }
}
