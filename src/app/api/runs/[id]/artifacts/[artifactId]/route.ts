import { readFile } from 'node:fs/promises';
import { relative, isAbsolute } from 'node:path';
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
    const local = relative(artifactRoot(), artifact.path);
    if (local.startsWith('..') || isAbsolute(local))
      return new Response('Invalid artifact path', { status: 403 });
    const file = await readFile(artifact.path);
    const headers: Record<string, string> = {
      'Content-Type': artifact.contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    };
    if (artifact.kind === 'trace' || new URL(request.url).searchParams.has('download'))
      headers['Content-Disposition'] =
        `attachment; filename="${artifact.kind}-${artifact.id}.${artifact.kind === 'trace' ? 'zip' : artifact.kind === 'video' ? 'webm' : 'jpg'}"`;
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${file.length}` },
        });
      const start = match[1] ? Number(match[1]) : Math.max(0, file.length - Number(match[2]));
      const end =
        match[1] && match[2] ? Math.min(Number(match[2]), file.length - 1) : file.length - 1;
      if (start > end || start >= file.length)
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${file.length}` },
        });
      return new Response(new Uint8Array(file.subarray(start, end + 1)), {
        status: 206,
        headers: {
          ...headers,
          'Content-Range': `bytes ${start}-${end}/${file.length}`,
          'Content-Length': String(end - start + 1),
        },
      });
    }
    return new Response(new Uint8Array(file), {
      headers: { ...headers, 'Content-Length': String(file.length) },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return new Response('Artifact unavailable', { status: 404 });
    return apiError(error);
  }
}
