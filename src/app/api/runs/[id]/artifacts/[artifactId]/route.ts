import { artifactResponse } from '@/workspace/artifactResponse';
import { getArtifact } from '@/workspace/store';
import { artifactRoot } from '@/workspace/recorder';
import { apiError, validId } from '@/workspace/http';
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
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return new Response('Artifact unavailable', { status: 404 });
    return apiError(error);
  }
}
export const HEAD = GET;
