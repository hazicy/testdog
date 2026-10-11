import { requireUserId } from '@/server/shared/auth';
import { serveArtifact } from '@/server/runs/artifactResponse';
import { getArtifact } from '@/server/runs/repository';
import { apiError, validId } from '@/server/shared/http';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; artifactId: string }> },
) {
  try {
    const { id, artifactId } = await context.params;

    validId(id);
    validId(artifactId);

    return await serveArtifact(
      request,
      await getArtifact(id, artifactId, await requireUserId(request)),
    );
  } catch (error) {
    return apiError(error);
  }
}

export const HEAD = GET;
