import { artifactResponse } from '@/workspace/server/artifactResponse';
import { getArtifact } from '@/workspace/server/store';
import { artifactRoot } from '@/workspace/server/artifactStorage';
import { apiError, validId } from '@/workspace/server/http';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; artifactId: string }> },
) {
  const { id, artifactId } = await context.params;
  try {
    validId(id);
    validId(artifactId);
    const artifact = await getArtifact(id, artifactId);
    return await artifactResponse(request, artifact, artifactRoot());
  } catch (error) {
    return apiError(error);
  }
}
export const HEAD = GET;
