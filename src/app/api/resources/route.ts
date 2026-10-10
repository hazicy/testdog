import { NextResponse } from 'next/server';
import { listResources, listWorkers } from '@/server/scheduling/scheduler';
import { apiError } from '@/server/shared/http';

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
