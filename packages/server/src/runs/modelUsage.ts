import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import { modelCalls, runSteps } from '@testdog/server/db/schema';
import type { ModelCallSummary, ModelCallDetail } from '@testdog/contracts/runs/modelCalls';
import { WorkspaceError } from '@testdog/server/shared/errors';
import type { ModelCallMetric } from '@testdog/automation/llm/budget';
import { runWrite } from '@testdog/server/scheduling/lease';

export function recordModelCall(runId: string, metric: ModelCallMetric) {
  return runWrite(runId, async (tx) => {
    await tx.insert(modelCalls).values({ runId, ...metric });
  });
}

export async function listModelCalls(runId: string): Promise<ModelCallSummary[]> {
  return db
    .select({
      id: modelCalls.id,
      startedAt: modelCalls.startedAt,
      durationMs: modelCalls.durationMs,
      model: modelCalls.model,
      status: modelCalls.status,
      retryCount: modelCalls.retryCount,
      failedAttempts: modelCalls.failedAttempts,
      inputTokens: modelCalls.inputTokens,
      outputTokens: modelCalls.outputTokens,
      errorCode: modelCalls.errorCode,
      purpose: sql<string | null>`${modelCalls.trace}->>'purpose'`,
      preview: sql<
        string | null
      >`left(coalesce(nullif(${modelCalls.trace}->>'reply', ''), ${modelCalls.trace}->'tools'->0->>'name'), 180)`,
      hasTrace: sql<boolean>`${modelCalls.trace} is not null`,
    })
    .from(modelCalls)
    .where(eq(modelCalls.runId, runId))
    .orderBy(asc(modelCalls.startedAt), asc(modelCalls.id));
}

export async function readModelCall(runId: string, callId: string): Promise<ModelCallDetail> {
  const [call] = await db
    .select({ trace: modelCalls.trace })
    .from(modelCalls)
    .where(and(eq(modelCalls.runId, runId), eq(modelCalls.id, callId)));

  if (!call) throw new WorkspaceError('AI 调用不存在', 404);
  const steps = await db
    .select({
      id: runSteps.id,
      toolCallId: runSteps.toolCallId,
      kind: runSteps.kind,
      title: runSteps.title,
      status: runSteps.status,
      startedAt: runSteps.startedAt,
      finishedAt: runSteps.finishedAt,
      durationMs: runSteps.durationMs,
      evidence: runSteps.evidence,
      error: runSteps.error,
      decision: runSteps.decision,
      action: runSteps.action,
    })
    .from(runSteps)
    .where(and(eq(runSteps.runId, runId), eq(runSteps.modelCallId, callId)))
    .orderBy(asc(runSteps.sequence));

  return {
    trace: call.trace,
    steps: steps.map((step) => ({
      ...step,
      toolCallId: step.toolCallId ?? undefined,
      finishedAt: step.finishedAt ?? undefined,
      durationMs: step.durationMs ?? undefined,
      evidence: step.evidence ?? undefined,
      error: step.error ?? undefined,
      decision: step.decision ?? undefined,
      action: step.action ?? undefined,
    })),
  };
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
