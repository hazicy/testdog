import { createHash } from 'node:crypto';

/** Validate the representation on each read without storing shared response state. */
export function jsonResponse(request: Request, data: unknown) {
  const body = JSON.stringify(data);
  const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-cache',
    ETag: etag,
  };
  const matches = request.headers
    .get('if-none-match')
    ?.split(',')
    .some((tag) => {
      const value = tag.trim().replace(/^W\//, '');
      return value === etag || value === '*';
    });
  return matches ? new Response(null, { status: 304, headers }) : new Response(body, { headers });
}
