/** Shared JSON transport for the workspace's client components. */
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new HttpError('服务响应异常，请稍后重试。', response.status);
  }
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data ? data.message : undefined;
    throw new HttpError(
      typeof message === 'string' ? message : '请求失败，请稍后重试。',
      response.status,
    );
  }
  return data as T;
}
export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
