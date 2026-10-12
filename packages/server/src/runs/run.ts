import { LoginPreparationError } from '@testdog/server/login-identities/runtime';
import { budgetedModel, modelBudgetFromEnv } from '@testdog/automation/llm/budget';
import { recordModelCall } from '@testdog/server/runs/modelUsage';
import { targetUrl } from '@testdog/contracts/automation/platform/target';
import { SecretInputs } from '@testdog/contracts/automation/platform/inputs';
import { hostname } from 'node:os';
import { leaseScope, setRunPhase } from '@testdog/server/scheduling/lease';
import {
  claimRun,
  registerWorker,
  releaseLease,
  renewLease,
  withLease,
} from '@testdog/server/scheduling/scheduler';
import { owner } from '@testdog/server/shared/workerIdentity';
import { appendEvent, getRun, savePlan } from '@testdog/server/runs/repository';
import { finishRun } from '@testdog/server/runs/lifecycle';
import { normalizeReplaySteps } from '@testdog/server/runs/replay';
import { TextCompiler } from '@testdog/automation/compiler/textCompiler';
import { resolvePlanInputs } from '@testdog/contracts/automation/compiler/executionPlan';
import { modelClient } from '@testdog/server/shared/model';
import { PlanRunner } from '@testdog/automation/planRunner';
import {
  openPlatformRuntime,
  RuntimeOpenError,
  type PlatformRuntime,
} from '@testdog/server/runs/runtime';
import type { TestRun } from '@testdog/contracts/runs/types';
import { RunAbortError } from '@testdog/server/runs/runAbort';
import { finalizeRuntime } from '@testdog/server/runs/finalizeRuntime';

const state = globalThis as typeof globalThis & { caseforgeJobs?: Map<string, AbortController> };
const jobs = (state.caseforgeJobs ??= new Map());

export function cancelRun(id: string) {
  jobs.get(id)?.abort(new RunAbortError('CANCELLED', '用户停止了测试'));
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error instanceof AggregateError)
    return `${error.message}\n${error.errors.map(errorMessage).join('\n')}`;

  return error.cause ? `${error.message}\n${errorMessage(error.cause)}` : error.message;
}

export async function executeRun(
  run: TestRun,
  resource?: { deviceId: string | null; metadata: Record<string, unknown> },
): Promise<void> {
  const lease = leaseScope.getStore();

  if (!lease) {
    const hostId = process.env.CASEFORGE_HOST_ID || hostname();

    await registerWorker(owner, hostId, [
      { id: `${hostId}:web:inline`, hostId, platform: 'web', profileId: 'mobile' },
    ]);
    const claim = await claimRun(owner, hostId, run.id);

    if (!claim) throw new Error('没有匹配的可用执行资源；请启动平台 worker');

    return withLease(claim.lease, () => executeRun(claim.run, claim.resource));
  }

  const controller = new AbortController();

  jobs.set(run.id, controller);
  let runtime: PlatformRuntime | undefined;
  let resourceHealthy = true;
  let pulseBusy = false;
  const pulse = async () => {
    if (pulseBusy) return;
    pulseBusy = true;
    try {
      const active = await renewLease(lease);

      if (!active || active.cancelRequested)
        controller.abort(
          active?.cancelRequested
            ? new RunAbortError('CANCELLED', '用户停止了测试')
            : new RunAbortError('LEASE_LOST', '执行租约失效'),
        );
    } catch (error) {
      controller.abort(new RunAbortError('LEASE_LOST', '执行续约失败', { cause: error }));
    } finally {
      pulseBusy = false;
    }
  };

  const heartbeatTimer = setInterval(() => void pulse(), 5000);
  let deadline = setTimeout(
    () => controller.abort(new RunAbortError('PREPARATION_TIMEOUT', '测试准备超过 2 分钟上限')),
    120000,
  );
  let status: TestRun['status'] = 'passed';
  let error: string | undefined;
  let evidenceComplete = true;
  let secrets: SecretInputs | undefined;
  let errorCode: string | null = null;

  try {
    secrets = new SecretInputs(run.authenticationVerification ? {} : run.targetSnapshot?.inputs);
    const model = budgetedModel(modelClient, modelBudgetFromEnv(), (metric) =>
      recordModelCall(run.id, metric),
    );

    await pulse();
    controller.signal.throwIfAborted();
    // Only historical replay jobs need the source; new jobs carry immutable snapshots.
    const source =
      run.mode === 'replay' && !run.recordingSteps && run.sourceRunId
        ? await getRun(run.sourceRunId)
        : undefined;
    const replaySteps = run.recordingSteps ?? source?.steps;

    if (run.mode === 'replay' && !replaySteps?.length)
      throw new Error('重放缺少操作快照，请重新录制');
    const report = (message: string) => appendEvent(run.id, message);
    const plan =
      (run.mode === 'replay'
        ? run.plan || source?.plan
        : run.plan && resolvePlanInputs(run.plan, run.targetSnapshot?.inputs)) ||
      (replaySteps
        ? {
            rootId: 'recording',
            nodes: {
              recording: {
                id: 'recording',
                kind: 'task' as const,
                goal: run.goal || '编辑录制',
                dependsOn: [],
                requirementIds: [],
                assertions: [],
              },
            },
          }
        : resolvePlanInputs(
            await new TextCompiler(model).compile(
              {
                goal: run.goal,
                url: (run.targetSnapshot ? targetUrl(run.targetSnapshot) : run.url) || undefined,
                context: {
                  platform: run.targetSnapshot?.platform ?? 'web',
                  ...(run.targetSnapshot && run.targetSnapshot.platform !== 'web'
                    ? { appId: run.targetSnapshot.appId }
                    : {}),
                  inputs: run.targetSnapshot?.inputs,
                },
              },
              controller.signal,
            ),
            run.targetSnapshot?.inputs,
          ));

    await savePlan(run.id, plan);
    await report(
      run.mode === 'replay'
        ? '开始重放已记录的操作，不重新规划动作'
        : '计划已生成，正在准备执行环境',
    );
    resourceHealthy = false;
    runtime = await openPlatformRuntime({
      model,
      run,
      plan,
      expectedEnvironment: run.recordingSteps
        ? run.replayEnvironmentSnapshot
        : source?.environmentSnapshot,
      resource,
      signal: controller.signal,
      report,
    });
    controller.signal.throwIfAborted();
    await setRunPhase(run.id, 'running', runtime.environment, runtime.session.capabilities);
    clearTimeout(deadline);
    deadline = setTimeout(
      () => controller.abort(new RunAbortError('EXECUTION_TIMEOUT', '测试超过 5 分钟执行上限')),
      300000,
    );
    const runner = new PlanRunner({
      plan,
      session: runtime.session,
      planner: runtime.planner,
      evaluator: runtime.evaluator,
      signal: controller.signal,
      report,
    });

    if (run.authenticationVerification) await report('登录身份验证成功');
    else if (run.mode === 'replay') await runner.replay(normalizeReplaySteps(replaySteps!));
    else await runner.record(runtime.initial);
    await report('全部操作与断言执行完成');
  } catch (cause) {
    if (cause instanceof RuntimeOpenError) resourceHealthy = cause.healthy;
    const reason = controller.signal.aborted ? controller.signal.reason : cause;

    status =
      reason instanceof RunAbortError && reason.code === 'CANCELLED' ? 'cancelled' : 'failed';
    errorCode =
      reason instanceof RunAbortError
        ? reason.code
        : cause instanceof RuntimeOpenError && cause.cause instanceof LoginPreparationError
          ? 'LOGIN_PREPARATION_FAILED'
          : 'EXECUTION_FAILED';
    if (!runtime) evidenceComplete = false;
    error = errorMessage(reason);
    if (controller.signal.aborted && cause !== reason) error += `\n${errorMessage(cause)}`;
  } finally {
    clearTimeout(deadline);
    const current = await getRun(run.id).catch(() => undefined);

    if (current?.cancelRequested) status = 'cancelled';
    await setRunPhase(run.id, 'finalizing').catch(() => {});
    if (runtime) {
      try {
        await finalizeRuntime(runtime, controller.signal.aborted);
      } catch (cause) {
        evidenceComplete = false;
        if (status !== 'cancelled') status = 'failed';
        errorCode ??= 'FINALIZATION_FAILED';
        error = `${error ? `${error}\n` : ''}无法归档执行证据：${errorMessage(cause)}`;
      }
    }

    jobs.delete(run.id);
    try {
      await finishRun(run.id, status, run.startedAt, secrets?.redact(error ?? '') || error, {
        evidenceComplete,
        errorCode,
      });
    } finally {
      clearInterval(heartbeatTimer);
      await releaseLease(lease, runtime?.healthy ?? resourceHealthy);
    }
  }
}
