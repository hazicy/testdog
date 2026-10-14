import { and, asc, eq } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import { db } from '@testdog/server/db';
import { testCases, testRuns, runSteps, recordingVersions } from '@testdog/server/db/schema';
import type { Plan } from '@testdog/contracts/automation/compiler/schema';
import { defaultWebTarget, type TestTarget } from '@testdog/contracts/automation/platform/target';
import { isActiveRun, type RecordingOperation } from '@testdog/contracts/runs/types';
import { runRequestSchema, type RunRequest } from '@testdog/contracts/runs/schemas';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { submitOnce } from '@testdog/server/shared/idempotency';
import type { z } from 'zod';
import { assertUserScope, ownedBy, type UserScope } from '@testdog/server/shared/ownership';
import { recordingOperation } from '@testdog/contracts/runs/lib/recordingOperation';
import { runRecord, stepRecord } from '@testdog/server/runs/records';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type RunOptions = { batchId?: string; goalOverride?: string };

function parseRunRequest(raw: unknown) {
  const parsed = runRequestSchema.safeParse(raw);

  if (!parsed.success) throw new WorkspaceError('执行参数无效，请指定用例、测试描述或重放来源。');

  return parsed.data;
}

export async function submitRun(request: Request, raw: unknown, userId: UserScope) {
  const input = parseRunRequest(raw);

  return submitOnce(
    request,
    input,
    async (tx) => ({ success: true, run: await persistRun(input, {}, tx, userId) }),
    userId,
  );
}

export async function createRun(
  request: RunRequest & RunOptions,
  transaction: Tx | undefined,
  userId: UserScope,
) {
  assertUserScope(userId);
  const { batchId, goalOverride, ...raw } = request;

  return persistRun(parseRunRequest(raw), { batchId, goalOverride }, transaction, userId);
}

async function persistRun(
  input: z.output<typeof runRequestSchema>,
  { batchId, goalOverride }: RunOptions,
  transaction: Tx | undefined,
  userId: UserScope,
) {
  const persist = async (tx: Tx) => {
    let snapshot: {
      targetSnapshot: TestTarget;
      testId?: string;
      name: string;
      goal: string;
      plan?: Plan | null;
      sourceRunId?: string;
      recordingVersionId?: string;
      recordingSteps?: RecordingOperation[];
      replayEnvironmentSnapshot?: Record<string, unknown> | null;
      mode: 'record' | 'replay';
    };

    if ('draft' in input) {
      snapshot = {
        name: `${input.draft.name} · 草稿试跑`,
        goal: input.draft.goal,
        plan: input.draft.plan,
        targetSnapshot: input.draft.target,
        mode: 'record',
      };
    } else if (input.mode === 'replay') {
      const [source] = await tx
        .select()
        .from(testRuns)
        .where(and(eq(testRuns.id, input.sourceRunId), ownedBy(testRuns.userId, userId)));

      if (!source) throw new WorkspaceError('原执行不存在。', 404);

      if (input.target && !isDeepStrictEqual(input.target, source.targetSnapshot))
        throw new WorkspaceError('重放目标与原录制不兼容。', 409);
      const [version] = input.recordingVersionId
        ? await tx
            .select()
            .from(recordingVersions)
            .where(
              and(
                eq(recordingVersions.id, input.recordingVersionId),
                eq(recordingVersions.runId, source.id),
              ),
            )
        : [];

      if (input.recordingVersionId && !version)
        throw new WorkspaceError('录制版本不存在或不属于此执行。', 404);
      if (isActiveRun(source.status)) throw new WorkspaceError('请等待录制结束后重放。', 409);
      if (!version && (source.status !== 'passed' || !source.replayable))
        throw new WorkspaceError('该记录包含失败或无法稳定定位的步骤，不能重放操作。');
      snapshot = {
        targetSnapshot: source.targetSnapshot,
        testId: source.testId ?? undefined,
        name: source.name,
        goal: source.goal,
        mode: 'replay',
        sourceRunId: source.id,
        recordingVersionId: version?.id,
        plan: source.plan,
        replayEnvironmentSnapshot: source.environmentSnapshot,
        recordingSteps:
          version?.steps.map(recordingOperation) ??
          (
            await tx
              .select()
              .from(runSteps)
              .where(eq(runSteps.runId, source.id))
              .orderBy(asc(runSteps.sequence))
          ).map((row) => recordingOperation(stepRecord(row))),
      };
    } else if ('testId' in input) {
      const [test] = await tx
        .select()
        .from(testCases)
        .where(and(eq(testCases.id, input.testId), ownedBy(testCases.userId, userId)));

      if (!test) throw new WorkspaceError('用例不存在。', 404);
      const target = input.target ?? test.target;

      snapshot = {
        targetSnapshot: target,
        testId: test.id,
        name: test.name,
        goal: goalOverride ?? test.goal,
        plan: goalOverride ? undefined : test.plan,
        mode: 'record',
      };
    } else {
      const target = input.target ?? defaultWebTarget(input.url!);

      snapshot = {
        targetSnapshot: target,
        name: '临时测试',
        goal: input.case,
        mode: 'record',
      };
    }

    const [run] = await tx
      .insert(testRuns)
      .values({ ...snapshot, userId, batchId, status: 'queued' })
      .returning();

    return runRecord(run);
  };

  return transaction ? persist(transaction) : db.transaction(persist);
}
