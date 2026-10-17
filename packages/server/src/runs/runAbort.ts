type RunAbortCode = 'CANCELLED' | 'PREPARATION_TIMEOUT' | 'EXECUTION_TIMEOUT' | 'LEASE_LOST';

export class RunAbortError extends Error {
  constructor(
    public code: RunAbortCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
