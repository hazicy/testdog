import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { modelCalls } from '@/db/schema';
import type { ModelCallMetric } from '@/automation/llm/budget';
import { runWrite } from '@/server/scheduling/lease';

export function recordModelCall(runId: string, metric: ModelCallMetric) {
  return runWrite(runId, async (tx) => {
    await tx.insert(modelCalls).values({ runId, ...metric });
  });
}

export async function readModelUsage(runId: string) {
  const [usage] = await db
    .select({
      calls: sql<number>`coalesce(sum(1 + ${modelCalls.retryCount}), 0)::int`,
      failures: sql<number>`coalesce(sum(${modelCalls.failedAttempts}), 0)::int`,
      retries: sql<number>`coalesce(sum(${modelCalls.retryCount}), 0)::int`,
      durationMs: sql<number>`coalesce(sum(${modelCalls.durationMs}), 0)::int`,
      inputTokens: sql<number>`coalesce(sum(${modelCalls.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${modelCalls.outputTokens}), 0)::int`,
      unknownUsage: sql<number>`(count(*) filter (where ${modelCalls.inputTokens} is null) + coalesce(sum(${modelCalls.retryCount}), 0))::int`,
    })
    .from(modelCalls)
    .where(eq(modelCalls.runId, runId));

  return usage;
}
