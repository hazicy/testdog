import { api } from './api';

/** Conditional GET reader; each resource owns its ETag and last successful value. */
export function createJsonReader<T>(url: string) {
  let etag: string | undefined;
  let value: T | undefined;

  return async () => {
    const request = api.get(url, {
      headers: etag && value !== undefined ? { 'If-None-Match': etag } : undefined,
      throwHttpErrors: (status) => status !== 304,
    });
    const response = await request;

    if (response.status === 304 && value !== undefined) return value;
    const data = await request.json<T>();

    value = data;
    etag = response.headers.get('etag') || undefined;

    return data;
  };
}
