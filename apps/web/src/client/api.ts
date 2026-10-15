import { createTranslator } from 'next-intl';
import en from '../../messages/en.json';
import zh from '../../messages/zh.json';
import ky, { isHTTPError, isNetworkError, isTimeoutError } from 'ky';

function errorMessages() {
  const locale =
    typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'zh';

  return createTranslator({ locale, messages: locale === 'en' ? en.errors : zh.errors });
}

// Localize generic errors returned by older endpoints while preserving specific server details.
function translateKnownError(message: string, t: ReturnType<typeof errorMessages>) {
  const key = (Object.keys(zh.errors) as (keyof typeof zh.errors)[]).find(
    (key) => zh.errors[key] === message,
  );

  return key ? t(key) : message;
}

export const api = ky.create({
  cache: 'no-store',
  timeout: 15000,
  totalTimeout: 15000,
  // SWR retries reads; mutations must only run once per user action.
  retry: 0,
  parseJson: (text) => {
    const t = errorMessages();

    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new Error(t('invalidResponse'), { cause });
    }
  },
  hooks: {
    beforeRequest: [({ request }) => request.signal.throwIfAborted()],
    beforeError: [
      ({ error, request }) => {
        const t = errorMessages();

        if (isHTTPError(error)) {
          const data = error.data;
          const message =
            data && typeof data === 'object' && 'message' in data ? data.message : undefined;

          error.message =
            typeof message === 'string'
              ? translateKnownError(message, t)
              : typeof data === 'string' || data === undefined
                ? t('invalidResponse')
                : t('requestFailed');
        } else if (isTimeoutError(error)) {
          error.message = ['GET', 'HEAD'].includes(request.method)
            ? t('readTimeout')
            : t('writeTimeout');
        } else if (isNetworkError(error)) {
          error.message = t('network');
        }

        return error;
      },
    ],
  },
});

export const fetchJson = <T>(url: string) => api.get(url).json<T>();
