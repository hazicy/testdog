import { and, asc, eq } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import { db } from '@testdog/server/db';
import { testCases, testRuns, runSteps, recordingVersions } from '@testdog/server/db/schema';
import {
  assertLoginIdentityReference,
  identityFor,
  loginFlow,
} from '@testdog/server/login-identities/repository';
import { validateInputReferences } from '@testdog/contracts/automation/compiler/executionPlan';
import type { Plan } from '@testdog/contracts/automation/compiler/schema';
import {
  defaultWebTarget,
  executionTarget,
  legacyWebTarget,
  targetUrl,
  type TestTarget,
} from '@testdog/contracts/automation/platform/target';
import { isActiveRun, type ExecutionStep } from '@testdog/contracts/runs/types';
import { runRequestSchema, type RunRequest } from '@testdog/contracts/runs/schemas';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { ownedBy, type UserScope } from '@testdog/server/shared/ownership';
import { runRecord, stepRecord } from '@testdog/server/runs/records';

export async function createRun(
  request: RunRequest & {
    batchId?: string;
    goalOverride?: string;
  },
  transaction?: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: UserScope = null,
) {
  const { batchId, goalOverride, ...inputRequest } = request;
  const parsed = runRequestSchema.safeParse(inputRequest);

  if (!parsed.success) throw new WorkspaceError('执行参数无效，请指定用例、测试描述或重放来源。');
  const input = parsed.data;
  const persist = async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    let snapshot: {
      authenticationVerification?: boolean;
      targetSnapshot: TestTarget;
      testId?: string;
      name: string;
      goal: string;
      plan?: Plan | null;
      url: string;
      sourceRunId?: string;
      recordingVersionId?: string;
      recordingSteps?: ExecutionStep[];
      replayEnvironmentSnapshot?: Record<string, unknown> | null;
      mode: 'record' | 'replay';
    };

    if ('loginIdentityId' in input) {
      const identity = await identityFor(input.loginIdentityId, userId, tx);
      const flow = await loginFlow(identity, tx);

      snapshot = {
        authenticationVerification: true,
        targetSnapshot: {
          ...flow.target,
          loginIdentityId: identity.id,
          inputs: { ...flow.target.inputs, ...identity.inputs },
          url: identity.checkUrl,
        },
        name: `${identity.name} · 登录验证`,
        url: identity.checkUrl,
        goal: '验证登录身份',
        plan: flow.plan,
        mode: 'record',
      };
    } else if ('draft' in input) {
      snapshot = {
        name: `${input.draft.name} · 草稿试跑`,
        goal: input.draft.goal,
        plan: input.draft.plan,
        targetSnapshot: input.draft.target,
        url: targetUrl(input.draft.target),
        mode: 'record',
      };
    } else if (input.mode === 'replay') {
      const [source] = await tx
        .select()
        .from(testRuns)
        .where(and(eq(testRuns.id, input.sourceRunId), ownedBy(testRuns.userId, userId)));

      if (!source) throw new WorkspaceError('原执行不存在。', 404);
      if (source.authenticationVerification)
        throw new WorkspaceError('登录身份验证请在设置中重新发起。');

      if (
        input.target &&
        !isDeepStrictEqual(input.target, source.targetSnapshot ?? legacyWebTarget(source.url))
      )
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
        targetSnapshot: source.targetSnapshot ?? legacyWebTarget(source.url),
        testId: source.testId ?? undefined,
        name: source.name,
        url: source.targetSnapshot ? targetUrl(source.targetSnapshot) : source.url,
        goal: source.goal,
        mode: 'replay',
        sourceRunId: source.id,
        recordingVersionId: version?.id,
        plan: source.plan,
        replayEnvironmentSnapshot: source.environmentSnapshot,
        recordingSteps:
          version?.steps ??
          (
            await tx
              .select()
              .from(runSteps)
              .where(eq(runSteps.runId, source.id))
              .orderBy(asc(runSteps.sequence))
          ).map(stepRecord),
      };
    } else if ('testId' in input) {
      const [test] = await tx
        .select()
        .from(testCases)
        .where(and(eq(testCases.id, input.testId), ownedBy(testCases.userId, userId)));

      if (!test) throw new WorkspaceError('用例不存在。', 404);
      const target = executionTarget(test.target ?? legacyWebTarget(test.url), input.target);

      snapshot = {
        targetSnapshot: target,
        testId: test.id,
        name: test.name,
        url: targetUrl(target),
        goal: goalOverride ?? test.goal,
        plan: goalOverride ? undefined : test.plan,
        mode: 'record',
      };
    } else {
      const target =
        input.target ?? (input.url ? defaultWebTarget(input.url) : legacyWebTarget(''));

      snapshot = {
        targetSnapshot: target,
        name: '临时测试',
        url: targetUrl(target),
        goal: input.case,
        mode: 'record',
      };
    }

    await assertLoginIdentityReference(snapshot.targetSnapshot, userId, tx);
    if (snapshot.mode === 'record') {
      try {
        validateInputReferences(snapshot.goal, snapshot.plan, snapshot.targetSnapshot.inputs);
      } catch (error) {
        throw new WorkspaceError(error instanceof Error ? error.message : String(error));
      }
    }

    const [run] = await tx
      .insert(testRuns)
      .values({ ...snapshot, userId, batchId, status: 'queued' })
      .returning();

    return runRecord(run);
  };

  return transaction ? persist(transaction) : db.transaction(persist);
}
