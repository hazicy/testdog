import { NextResponse } from 'next/server';
import { listResources, listWorkers } from '@/workspace/server/scheduler';
import { apiError } from '@/workspace/server/http';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const [resources, workers] = await Promise.all([listResources(), listWorkers()]);
    return NextResponse.json({
      resources: resources.map(({ metadata: _metadata, ...resource }) => {
        void _metadata;
        return resource;
      }),
      workers,
    });
  } catch (error) {
    return apiError(error);
  }
}
