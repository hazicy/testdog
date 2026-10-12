import ky, { isHTTPError, isNetworkError, isTimeoutError } from 'ky';

export const api = ky.create({
  cache: 'no-store',
  timeout: 15000,
  totalTimeout: 15000,
  // SWR retries reads; mutations must only run once per user action.
  retry: 0,
  parseJson: (text) => {
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new Error('服务响应异常，请稍后重试。', { cause });
    }
  },
  hooks: {
    beforeRequest: [({ request }) => request.signal.throwIfAborted()],
    beforeError: [
      ({ error, request }) => {
        if (isHTTPError(error)) {
          const data = error.data;
          const message =
            data && typeof data === 'object' && 'message' in data ? data.message : undefined;

          error.message =
            typeof message === 'string'
              ? message
              : typeof data === 'string' || data === undefined
                ? '服务响应异常，请稍后重试。'
                : '请求失败，请稍后重试。';
        } else if (isTimeoutError(error)) {
          error.message = ['GET', 'HEAD'].includes(request.method)
            ? '请求超时，请稍后重试。'
            : '请求超时，操作可能已完成，请刷新确认后再试。';
        } else if (isNetworkError(error)) {
          error.message = '无法连接服务，请检查网络后重试。';
        }

        return error;
      },
    ],
  },
});

export const fetchJson = <T>(url: string) => api.get(url).json<T>();
