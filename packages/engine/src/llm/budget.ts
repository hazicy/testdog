import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import type { ModelClient, LLMGenerateResult } from '@testdog/engine/llm/contracts';
import type { ModelCallTrace } from '@testdog/contracts/runs/modelCalls';
import { modelTrace } from './modelTrace';

export type ModelCallMetric = {
  id: string;
  startedAt: string;
  durationMs: number;
  model: string;
  status: 'passed' | 'failed' | 'cancelled' | 'timeout';
  retryCount: number;
  failedAttempts: number;
  inputTokens?: number;
  outputTokens?: number;
  errorCode?: string;
  trace?: ModelCallTrace;
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
    maxTokens: 1000000,
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
    const value = process.env[`TESTDOG_AI_${names[key]}`];

    if (value !== undefined) defaults[key] = Number(value);
    if (!Number.isSafeInteger(defaults[key]) || defaults[key] < (key === 'maxRetries' ? 0 : 1))
      throw new Error(`TESTDOG_AI_${names[key]} 配置无效`);
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
        const callId = randomUUID();
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
        let failedAttempts = 0;
        let result: LLMGenerateResult | undefined;
        let failure: unknown;

        try {
          for (;;) {
            signal.throwIfAborted();
            retryCount = failedAttempts;
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

          result = {
            ...result,
            callId,
            toolCalls: (result.toolCalls || []).map((call, index) => ({
              ...call,
              id: call.id || `${callId}:${index}`,
            })),
          };

          return result;
        } catch (error) {
          failure = error;
          if (error instanceof Error) Object.assign(error, { modelCallId: callId });
          throw error;
        } finally {
          clearTimeout(timer);
          const durationMs = Date.now() - start;

          duration += durationMs;
          await record({
            id: callId,
            startedAt,
            durationMs,
            model:
              result?.model ??
              (params.provider === 'jev'
                ? (process.env.JEV_MODEL ?? 'jev-1.14.0')
                : 'deepseek-flash'),
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
            trace: modelTrace(params, result),
            // Provider failures may contain credentials; retain only their error class.
            errorCode: result ? undefined : failure instanceof Error ? failure.name : 'UNKNOWN',
          });
        }
      };

      const next = previous.then(execute);

      previous = next.catch(() => {});

      return next;
    },
  };
}
