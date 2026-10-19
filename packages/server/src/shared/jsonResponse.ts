import { createHash } from 'node:crypto';

/** Validate the representation on each read without storing shared response state. */
export function jsonResponse(request: Request, data: unknown, validator?: string) {
  if (validator && matchesEtag(request.headers.get('if-none-match'), validator))
    return new Response(null, {
      status: 304,
      headers: { ETag: validator, 'Cache-Control': 'private, no-cache' },
    });
  const body = JSON.stringify(data);
  const etag = validator ?? `"${createHash('sha256').update(body).digest('hex')}"`;
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-cache',
    ETag: etag,
  };
  const matches = matchesEtag(request.headers.get('if-none-match'), etag);

  return matches ? new Response(null, { status: 304, headers }) : new Response(body, { headers });
}

export function matchesEtag(header: string | null, etag: string) {
  return (
    header?.split(',').some((tag) => {
      const value = tag.trim().replace(/^W\//, '');

      return value === etag.replace(/^W\//, '') || value === '*';
    }) ?? false
  );
}
