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

const state = globalThis as typeof globalThis & { testdogJobs?: Map<string, AbortController> };

export const jobs = (state.testdogJobs ??= new Map());

export function cancelRun(id: string) {
  jobs.get(id)?.abort(new RunAbortError('CANCELLED', '用户停止了测试'));
}
