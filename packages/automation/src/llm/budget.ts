import { setTimeout as delay } from 'node:timers/promises';
import type { ModelClient, LLMGenerateResult } from '@testdog/contracts/automation/llm/contracts';

export type ModelCallMetric = {
  startedAt: string;
  durationMs: number;
  model: string;
  status: 'passed' | 'failed' | 'cancelled' | 'timeout';
  retryCount: number;
  failedAttempts: number;
  inputTokens?: number;
  outputTokens?: number;
  errorCode?: string;
};
export type ModelBudget = {
  timeoutMs: number;
  maxCalls: number;
  maxTokens: number;
  maxDurationMs: number;
  maxRetries: number;
  maxOutputTokens: number;
};

export function modelBudgetFromEnv(): ModelBudget {
  const defaults: ModelBudget = {
    timeoutMs: 60000,
    maxCalls: 60,
    maxTokens: 200000,
    maxDurationMs: 300000,
    maxRetries: 1,
    maxOutputTokens: 8192,
  };
  const names = {
    timeoutMs: 'TIMEOUT_MS',
    maxCalls: 'MAX_CALLS',
    maxTokens: 'MAX_TOKENS',
    maxDurationMs: 'MAX_DURATION_MS',
    maxRetries: 'MAX_RETRIES',
    maxOutputTokens: 'MAX_OUTPUT_TOKENS',
  };

  for (const key of Object.keys(defaults) as (keyof ModelBudget)[]) {
    const value = process.env[`CASEFORGE_AI_${names[key]}`];

    if (value !== undefined) defaults[key] = Number(value);
    if (!Number.isSafeInteger(defaults[key]) || defaults[key] < (key === 'maxRetries' ? 0 : 1))
      throw new Error(`CASEFORGE_AI_${names[key]} 配置无效`);
  }

  if (defaults.maxRetries > 3) throw new Error('AI 重试最多 3 次');

  return defaults;
}

export function budgetedModel(
  client: ModelClient,
  budget: ModelBudget,
  record: (metric: ModelCallMetric) => Promise<void>,
): ModelClient {
  let calls = 0;
  let tokens = 0;
  let duration = 0;
  // Serialize calls so concurrent planners cannot overspend the shared run budget.
  let previous: Promise<unknown> = Promise.resolve();

  return {
    generate(params) {
      const execute = async () => {
        params.signal?.throwIfAborted();
        if (
          calls >= budget.maxCalls ||
          tokens >= budget.maxTokens ||
          duration >= budget.maxDurationMs
        )
          throw new Error('测试 AI 调用预算已耗尽');
        const start = Date.now();
        const startedAt = new Date(start).toISOString();
        const controller = new AbortController();
        const signal = params.signal
          ? AbortSignal.any([params.signal, controller.signal])
          : controller.signal;
        const timer = setTimeout(
          () => controller.abort(new Error('AI 调用超时或耗时预算耗尽')),
          Math.min(budget.timeoutMs, budget.maxDurationMs - duration),
        );
        let retryCount = 0;
        let callsForRequest = 0;
        let failedAttempts = 0;
        let result: LLMGenerateResult | undefined;
        let failure: unknown;

        try {
          for (;;) {
            signal.throwIfAborted();
            if (callsForRequest > 0) retryCount++;
            callsForRequest++;
            calls++;
            try {
              // Race also protects callers when a custom adapter ignores AbortSignal.
              result = await new Promise<LLMGenerateResult>((resolve, reject) => {
                const abort = () => reject(signal.reason);

                signal.addEventListener('abort', abort, { once: true });
                void client
                  .generate({
                    ...params,
                    signal,
                    maxOutputTokens: Math.min(
                      params.maxOutputTokens ?? budget.maxOutputTokens,
                      budget.maxOutputTokens,
                      budget.maxTokens - tokens,
                    ),
                  })
                  .then(resolve, reject)
                  .finally(() => signal.removeEventListener('abort', abort));
              });
              if (result.usage) tokens += result.usage.inputTokens + result.usage.outputTokens;
              break;
            } catch (error) {
              failure = error;
              failedAttempts++;
              const status =
                error && typeof error === 'object' && 'status' in error
                  ? Number(error.status)
                  : undefined;
              const retryable =
                status === 429 ||
                (status != null && status >= 500) ||
                (error instanceof Error && error.name === 'APIConnectionError');

              if (
                signal.aborted ||
                !retryable ||
                retryCount >= budget.maxRetries ||
                calls >= budget.maxCalls
              )
                throw error;
              await delay(250 * 2 ** retryCount, undefined, { signal });
            }
          }

          return result;
        } catch (error) {
          failure = error;
          throw error;
        } finally {
          clearTimeout(timer);
          const durationMs = Date.now() - start;

          duration += durationMs;
          await record({
            startedAt,
            durationMs,
            model: result?.model ?? 'deepseek-flash',
            status: result
              ? 'passed'
              : params.signal?.aborted
                ? 'cancelled'
                : controller.signal.aborted
                  ? 'timeout'
                  : 'failed',
            retryCount,
            failedAttempts,
            ...result?.usage,
            // Never persist raw provider errors, prompts, credentials or page contents.
            errorCode: result ? undefined : failure instanceof Error ? failure.name : 'UNKNOWN',
          });
        }
      };

      const next = previous.then(execute, execute);

      previous = next.catch(() => {});

      return next;
    },
  };
}
