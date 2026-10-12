import type { SWRConfiguration } from 'swr';
import { isHTTPError } from 'ky';

/** Retry only while this resource still permits automatic network reads. */
export const retryVisibleRequest: NonNullable<SWRConfiguration['onErrorRetry']> = (
  error,
  _key,
  config,
  revalidate,
  options,
) => {
  if (isHTTPError(error) && [400, 401, 403, 404].includes(error.response.status)) return;
  if (!config.isVisible() || !config.isOnline()) return;
  setTimeout(() => {
    if (config.isVisible() && config.isOnline()) revalidate(options);
  }, config.errorRetryInterval);
};
