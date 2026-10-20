import { requireUserId } from '@/server/shared/auth';
import { serveArtifact } from '@testdog/server/runs/artifactResponse';
import { getArtifact } from '@testdog/server/runs/repository';
import { apiError, validId } from '@testdog/server/http/api';

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
