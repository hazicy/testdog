import type { SWRConfiguration } from 'swr';
import { HttpError } from './api';

/** Retry only while this resource still permits automatic network reads. */
export const retryVisibleRequest: NonNullable<SWRConfiguration['onErrorRetry']> = (
  error,
  _key,
  config,
  revalidate,
  options,
) => {
  if (error instanceof HttpError && (error.status === 400 || error.status === 404)) return;
  if (!config.isVisible() || !config.isOnline()) return;
  setTimeout(() => {
    if (config.isVisible() && config.isOnline()) revalidate(options);
  }, config.errorRetryInterval);
};
