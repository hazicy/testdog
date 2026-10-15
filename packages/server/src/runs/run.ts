import { budgetedModel, modelBudgetFromEnv } from '@testdog/automation/llm/budget';
import { recordModelCall } from '@testdog/server/runs/modelUsage';
import { targetUrl } from '@testdog/contracts/automation/platform/target';
import { leaseScope, LostLeaseError, setRunPhase } from '@testdog/server/scheduling/lease';
import { releaseLease, renewLease } from '@testdog/server/scheduling/scheduler';
import { appendEvent, savePlan } from '@testdog/server/runs/repository';
import { finishRun } from '@testdog/server/runs/lifecycle';
import { normalizeReplaySteps } from '@testdog/contracts/runs/lib/replay';
import { TextCompiler } from '@testdog/automation/compiler/textCompiler';
import { modelClient } from '@testdog/server/shared/model';
import { PlanRunner } from '@testdog/automation/planRunner';
import { openPlatformRuntime } from '@testdog/server/runs/runtime';
import { RuntimeOpenError, type PlatformRuntime } from '@testdog/server/runs/runtimeTypes';
import type { TestRun } from '@testdog/contracts/runs/types';
import { RunAbortError } from '@testdog/server/runs/runAbort';
import { finalizeRuntime } from '@testdog/server/runs/finalizeRuntime';

const state = globalThis as typeof globalThis & { testdogJobs?: Map<string, AbortController> };
const jobs = (state.testdogJobs ??= new Map());

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

  if (!lease || lease.runId !== run.id) throw new LostLeaseError('执行器需要当前任务的执行租约');

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
  let errorCode: string | null = null;

  try {
    const model = budgetedModel(modelClient, modelBudgetFromEnv(), (metric) =>
      recordModelCall(run.id, metric),
    );

    await pulse();
    controller.signal.throwIfAborted();
    const replaySteps = run.recordingSteps;

    if (run.mode === 'replay' && !replaySteps?.length)
      throw new Error('录制缺少操作快照，请重新录制');
    const report = (message: string) => appendEvent(run.id, message);
    const plan =
      run.plan ||
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
        : await new TextCompiler(model).compile(
            {
              goal: run.goal,
              url: targetUrl(run.targetSnapshot) || undefined,
              context: {
                platform: run.targetSnapshot.platform,
                ...(run.targetSnapshot.platform !== 'web'
                  ? { appId: run.targetSnapshot.appId }
                  : {}),
              },
            },
            controller.signal,
          ));

    await savePlan(run.id, plan);
    await report(run.mode === 'replay' ? '正在按录制步骤重新运行' : '计划已生成，正在准备执行环境');
    resourceHealthy = false;
    runtime = await openPlatformRuntime({
      model,
      run,
      plan,
      expectedEnvironment: run.replayEnvironmentSnapshot,
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

    if (run.mode === 'replay') await runner.replay(normalizeReplaySteps(replaySteps!));
    else await runner.record(runtime.initial);
    await report('全部操作与断言执行完成');
  } catch (cause) {
    if (cause instanceof RuntimeOpenError) resourceHealthy = cause.healthy;
    const reason = controller.signal.aborted ? controller.signal.reason : cause;

    status =
      reason instanceof RunAbortError && reason.code === 'CANCELLED' ? 'cancelled' : 'failed';
    errorCode = reason instanceof RunAbortError ? reason.code : 'EXECUTION_FAILED';
    if (!runtime) evidenceComplete = false;
    error = errorMessage(reason);
    if (controller.signal.aborted && cause !== reason) error += `\n${errorMessage(cause)}`;
  } finally {
    clearTimeout(deadline);
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
      await finishRun(run.id, status, run.startedAt, error, {
        evidenceComplete,
        errorCode,
      });
    } finally {
      clearInterval(heartbeatTimer);
      await releaseLease(lease, runtime?.healthy ?? resourceHealthy);
    }
  }
}
