import { artifactResponse } from '@/server/runs/artifactResponse';
import { getArtifact } from '@/server/runs/repository';
import { artifactRoot } from '@/server/runs/artifactStorage';
import { apiError, validId } from '@/server/shared/http';
import { readArtifactFile } from '@/server/runs/artifactStorage';

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
    if (!artifact.path.startsWith('s3://'))
      return artifactResponse(request, artifact, artifactRoot());
    const file = await readArtifactFile(id, artifactId, artifact.path);
    const headers: Record<string, string> = {
      'Content-Type': artifact.contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    };
    if (artifact.kind === 'trace' || new URL(request.url).searchParams.has('download')) {
      const extensions: Record<string, string> = {
        'application/zip': 'zip',
        'video/webm': 'webm',
        'video/mp4': 'mp4',
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'application/json': 'json',
        'application/x-ndjson': 'ndjson',
        'text/plain': 'log',
      };
      const extension = extensions[artifact.contentType] || 'bin';

      headers['Content-Disposition'] =
        `attachment; filename="${artifact.kind}-${artifact.id}.${extension}"`;
    }
    if (request.method === 'HEAD')
      return new Response(null, { headers: { ...headers, 'Content-Length': String(file.length) } });
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
    return apiError(error);
  }
}

export const HEAD = GET;
