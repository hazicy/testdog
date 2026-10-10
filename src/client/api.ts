/** Shared JSON transport for the workspace's client components. */
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  return readJson<T>(url, init);
}

export function createJsonReader<T>(url: string) {
  const cache: { etag?: string; value?: T } = {};
  return (init?: Omit<RequestInit, 'method' | 'body'>) =>
    readJson(url, { ...init, method: 'GET' }, cache);
}

async function readJson<T>(
  url: string,
  init?: RequestInit,
  cache?: { etag?: string; value?: T },
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(init?.signal?.reason);
  const timeout = new HttpError(
    init?.method && !['GET', 'HEAD'].includes(init.method.toUpperCase())
      ? '请求超时，操作可能已完成，请刷新确认后再试。'
      : '请求超时，请稍后重试。',
    408,
  );
  const timer = setTimeout(() => controller.abort(timeout), 15000);
  init?.signal?.addEventListener('abort', cancel, { once: true });
  if (init?.signal?.aborted) cancel();
  try {
    controller.signal.throwIfAborted();
    const headers = new Headers(init?.headers);
    if (cache?.etag && cache.value !== undefined) headers.set('If-None-Match', cache.etag);
    const response = await fetch(url, {
      cache: 'no-store',
      ...init,
      headers,
      signal: controller.signal,
    });
    if (response.status === 304 && cache?.value !== undefined) return cache.value;
    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new HttpError('服务响应异常，请稍后重试。', response.status);
    }
    controller.signal.throwIfAborted();
    if (!response.ok) {
      const message =
        data && typeof data === 'object' && 'message' in data ? data.message : undefined;
      throw new HttpError(
        typeof message === 'string' ? message : '请求失败，请稍后重试。',
        response.status,
      );
    }
    if (cache) {
      cache.value = data as T;
      cache.etag = response.headers.get('etag') || undefined;
    }
    return data as T;
  } catch (error) {
    if (controller.signal.reason === timeout) throw timeout;
    throw error;
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener('abort', cancel);
  }
}
export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
