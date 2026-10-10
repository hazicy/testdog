import { timingSafeEqual } from 'node:crypto';

function equal(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export function workspaceAuthorized(request: Request): boolean {
  const username = process.env.CASEFORGE_AUTH_USER;
  const password = process.env.CASEFORGE_AUTH_PASSWORD;

  if (!username && !password) {
    const required =
      process.env.CASEFORGE_REQUIRE_AUTH === 'true' ||
      (process.env.NODE_ENV === 'production' &&
        process.env.CASEFORGE_ALLOW_UNAUTHENTICATED !== 'true');

    return !required;
  }

  if (!username || !password) return false;
  const header = request.headers.get('authorization');

  if (!header?.startsWith('Basic ')) return false;
  const credentials = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const separator = credentials.indexOf(':');

  if (separator < 0) return false;

  return (
    equal(credentials.slice(0, separator), username) &&
    equal(credentials.slice(separator + 1), password)
  );
}
