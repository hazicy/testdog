import { inputGoal, SecretInputs } from '@/automation/platform/inputs';
import { hostname } from 'node:os';
import { leaseScope, setRunPhase, runWrite } from './lease';
import { claimRun, registerWorker, releaseLease, withLease } from './scheduler';
import { owner, appendEvent, finishRun, getRun, heartbeat, savePlan } from './store';
import { TextCompiler } from '@/automation/compiler/textCompiler';
import { PlanRunner } from '@/automation/planRunner';
import { openPlatformRuntime, type PlatformRuntime } from '@/automation/platform/runtime';
import type { TestRun } from '../types';
import { testRuns } from '@/db/schema';
import { eq } from 'drizzle-orm';
const state = globalThis as typeof globalThis & { caseforgeJobs?: Map<string, AbortController> };
const jobs = (state.caseforgeJobs ??= new Map());
export function cancelRun(id: string) {
  jobs.get(id)?.abort(new Error('用户停止了测试'));
}
export function errorMessage(error: unknown): string {
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
  let pulseBusy = false;
  const pulse = async () => {
    if (pulseBusy) return;
    pulseBusy = true;
    try {
      const active = await heartbeat(run.id);
      if (!active || active.cancelRequested)
        controller.abort(new Error(active?.cancelRequested ? '用户停止了测试' : '执行租约失效'));
    } catch (error) {
      controller.abort(error);
    } finally {
      pulseBusy = false;
    }
  };
  const heartbeatTimer = setInterval(() => void pulse(), 5000);
  let deadline = setTimeout(() => controller.abort(new Error('测试准备超过 2 分钟上限')), 120000);
  let status: TestRun['status'] = 'passed';
  let error: string | undefined;
  let evidenceComplete = true;
  try {
    await pulse();
    controller.signal.throwIfAborted();
    const source = run.sourceRunId ? await getRun(run.sourceRunId) : undefined;
    const report = (message: string) => appendEvent(run.id, message);
    const plan =
      source?.plan ||
      (run.recordingSteps
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
        : await new TextCompiler().compile(
            inputGoal(run.goal, run.targetSnapshot?.inputs),
            run.url || undefined,
            controller.signal,
          ));
    await savePlan(run.id, plan);
    await report(
      run.mode === 'replay'
        ? '开始重放已记录的操作，不重新规划动作'
        : '计划已生成，正在准备执行环境',
    );
    runtime = await openPlatformRuntime({
      run,
      plan,
      source,
      resource,
      signal: controller.signal,
      report,
    });
    controller.signal.throwIfAborted();
    await setRunPhase(run.id, 'running', runtime.environment, runtime.session.capabilities);
    clearTimeout(deadline);
    deadline = setTimeout(() => controller.abort(new Error('测试超过 5 分钟执行上限')), 300000);
    const runner = new PlanRunner({
      plan,
      session: runtime.session,
      planner: runtime.planner,
      signal: controller.signal,
      report,
    });
    if (source) {
      const steps = run.recordingSteps || source.steps;
      await runner.replay(steps);
    } else await runner.record(runtime.initial);
    await report('全部操作与断言执行完成');
  } catch (cause) {
    status = 'failed';
    if (!runtime) evidenceComplete = false;
    error = errorMessage(controller.signal.aborted ? controller.signal.reason : cause);
    try {
      error = new SecretInputs(run.targetSnapshot?.inputs).redact(error);
    } catch {
      /* Missing secrets were never dispatched. */
    }
  } finally {
    clearTimeout(deadline);
    const current = await getRun(run.id).catch(() => undefined);
    if (current?.cancelRequested) status = 'cancelled';
    await setRunPhase(run.id, 'finalizing').catch(() => {});
    if (runtime) {
      let archiveTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          runtime.finalize(controller.signal.aborted),
          new Promise<never>((_resolve, reject) => {
            archiveTimer = setTimeout(
              () => reject(new Error('证据归档超过 30 秒上限，资源将保持隔离')),
              30000,
            );
          }),
        ]);
      } catch (cause) {
        evidenceComplete = false;
        if (status !== 'cancelled') status = 'failed';
        error = `${error ? `${error}\n` : ''}无法归档执行证据：${errorMessage(cause)}`;
      } finally {
        clearTimeout(archiveTimer);
      }
    }
    jobs.delete(run.id);
    try {
      await runWrite(run.id, async (tx) => {
        await tx
          .update(testRuns)
          .set({
            evidenceComplete,
            errorCode: error
              ? current?.cancelRequested
                ? 'CANCELLED'
                : controller.signal.aborted
                  ? 'TIMEOUT_OR_ABORT'
                  : 'EXECUTION_FAILED'
              : null,
          })
          .where(eq(testRuns.id, run.id));
      });
      await finishRun(run.id, status, run.startedAt, error);
    } finally {
      clearInterval(heartbeatTimer);
      await releaseLease(lease, runtime?.healthy ?? run.targetSnapshot?.platform === 'web');
    }
  }
}
