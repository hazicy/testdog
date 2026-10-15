import { open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { Readable } from 'node:stream';
import { artifactRoot, openRemoteArtifact } from '@testdog/server/runs/artifactStorage';

export type ArtifactFile = { path: string; contentType: string; id: string; kind: string };
type ArtifactRecord = ArtifactFile & { runId: string };

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

function contained(root: string, path: string) {
  const local = relative(root, path);

  return local !== '' && local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local);
}

function byteRange(value: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);

  if (!match || (!match[1] && !match[2]) || size === 0) return;
  const first = Number(match[1]);
  const last = Number(match[2]);

  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return;
  const start = match[1] ? first : Math.max(0, size - last);
  const end = match[1] && match[2] ? Math.min(last, size - 1) : size - 1;

  if (start > end || start >= size) return;

  return { start, end };
}

// HEAD describes the full representation and ignores Range, as required by HTTP.
function representation(request: Request, artifact: ArtifactFile, size: number) {
  const headers: Record<string, string> = {
    'Content-Type': artifact.contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  };

  if (artifact.kind === 'trace' || new URL(request.url).searchParams.has('download'))
    headers['Content-Disposition'] =
      `attachment; filename="${artifact.kind}-${artifact.id}.${artifact.kind === 'trace' ? 'zip' : extensions[artifact.contentType] || 'bin'}"`;
  const requested = request.method === 'HEAD' ? null : request.headers.get('range');
  const range = requested === null ? undefined : byteRange(requested, size);

  if (requested !== null && !range)
    return {
      headers: { ...headers, 'Content-Range': `bytes */${size}`, 'Content-Length': '0' },
      range,
      unsatisfiable: true,
    };
  headers['Content-Length'] = String(range ? range.end - range.start + 1 : size);
  if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;

  return { headers, range, unsatisfiable: false };
}

/** Streams only the requested bytes; the stream owns and closes its file handle. */
export async function artifactResponse(request: Request, artifact: ArtifactFile, root: string) {
  try {
    return await readArtifact(request, artifact, root);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    )
      return new Response('Artifact unavailable', { status: 404 });
    throw error;
  }
}

// Both backends stream only the requested bytes and share the same HTTP contract.
export async function serveArtifact(request: Request, artifact: ArtifactRecord) {
  if (!artifact.path.startsWith('s3://'))
    return artifactResponse(request, artifact, artifactRoot());
  const remote = await openRemoteArtifact(
    artifact.runId,
    artifact.id,
    artifact.path,
    request.signal,
  );
  let streamOwnsClient = false;

  try {
    const { headers, range, unsatisfiable } = representation(request, artifact, remote.size);

    if (unsatisfiable) return new Response(null, { status: 416, headers });
    if (request.method === 'HEAD' || remote.size === 0) return new Response(null, { headers });
    const body = await remote.stream(range);
    const response = new Response(body, { status: range ? 206 : 200, headers });

    streamOwnsClient = true;

    return response;
  } finally {
    if (!streamOwnsClient) remote.close();
  }
}

async function readArtifact(request: Request, artifact: ArtifactFile, root: string) {
  if (!contained(root, artifact.path))
    return new Response('Invalid artifact path', { status: 403 });
  const [resolvedRoot, resolvedPath] = await Promise.all([realpath(root), realpath(artifact.path)]);

  if (!contained(resolvedRoot, resolvedPath))
    return new Response('Invalid artifact path', { status: 403 });

  const file = await open(resolvedPath, 'r');
  let streamOwnsFile = false;

  try {
    const info = await file.stat();

    if (!info.isFile()) return new Response('Artifact unavailable', { status: 404 });
    const { headers, range, unsatisfiable } = representation(request, artifact, info.size);

    if (unsatisfiable) return new Response(null, { status: 416, headers });
    if (request.method === 'HEAD' || info.size === 0) return new Response(null, { headers });

    const stream = file.createReadStream({ ...range, autoClose: true });
    const abort = () => stream.destroy();

    request.signal.addEventListener('abort', abort, { once: true });
    stream.once('close', () => request.signal.removeEventListener('abort', abort));
    const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
    const response = new Response(body, { status: range ? 206 : 200, headers });

    streamOwnsFile = true;
    if (request.signal.aborted) abort();

    return response;
  } finally {
    if (!streamOwnsFile) await file.close();
  }
}
