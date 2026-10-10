import { requireUserId } from '@/server/shared/auth';
import { NextResponse } from 'next/server';
import { listResources } from '@/server/scheduling/scheduler';
import { withApiError } from '@/server/shared/http';

export const runtime = 'nodejs';

export const GET = withApiError(async (request: Request) => {
  await requireUserId(request);
  const resources = await listResources();

  // Shared capacity catalog; omit lease owners, run IDs and host metadata.
  return NextResponse.json({
    resources: resources.map((resource) => ({
      id: resource.id,
      platform: resource.platform,
      profileId: resource.profileId,
      deviceId: resource.deviceId,
      status: resource.status,
    })),
  });
});
