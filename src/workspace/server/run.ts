import type { Browser, BrowserContext } from 'playwright';
import { Executor } from '@/automation/executor';
import { launchBrowser } from '@/automation/browser';
import { TextCompiler } from '@/automation/compiler/textCompiler';
import { Observer } from '@/automation/observer';
import { Planner } from '@/automation/planner';
import { appendEvent, getRun, savePlan } from './store';
import { finishRun, heartbeat } from './runLifecycle';
import { RunRecorder } from './recorder';
import type { TestRun } from '../types';
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
export async function executeRun(run: TestRun) {
  const controller = new AbortController();
  jobs.set(run.id, controller);
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let recorder: RunRecorder | undefined;
  let cancelled = false;
  let pulseBusy = false;
  const pulse = async () => {
    if (pulseBusy) return;
    pulseBusy = true;
    try {
      const active = await heartbeat(run.id);
      if (!active) {
        controller.abort(new Error('执行租约失效，当前执行器已停止'));
      } else if (active.cancelRequested) {
        cancelled = true;
        controller.abort(new Error('用户停止了测试'));
      }
    } catch (error) {
      controller.abort(error);
    } finally {
      pulseBusy = false;
    }
  };
  const heartbeatTimer = setInterval(() => void pulse(), 5000);
  const deadline = setTimeout(() => controller.abort(new Error('测试超过 5 分钟执行上限')), 300000);
  const abort = () => {
    void browser?.close().catch(() => {});
  };
  controller.signal.addEventListener('abort', abort);
  let status: TestRun['status'] = 'passed';
  let error: string | undefined;
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
        : await new TextCompiler().compile(run.goal, run.url || undefined, controller.signal));
    await savePlan(run.id, plan);
    await report(
      run.mode === 'replay'
        ? '开始重放已记录的操作，不重新规划浏览器动作'
        : '计划已生成，正在启动浏览器',
    );
    controller.signal.throwIfAborted();
    browser = await launchBrowser();
    controller.signal.throwIfAborted();
    recorder = new RunRecorder(run);
    await recorder.prepare();
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: recorder.directory, size: { width: 1280, height: 800 } },
    });
    context.setDefaultTimeout(15000);
    const page = await context.newPage();
    await recorder.start(context);
    recorder.onPage(page);
    const executor = new Executor(
      new Observer(),
      plan,
      run.url || undefined,
      new Planner(controller.signal),
      report,
      { signal: controller.signal, onPage: recorder.onPage, onStep: recorder.onStep },
    );
    if (source) await executor.replay(page, run.recordingSteps || source.steps);
    else await executor.record(page);
    await report('全部操作与断言执行完成');
  } catch (cause) {
    status = 'failed';
    error = errorMessage(controller.signal.aborted ? controller.signal.reason : cause);
  } finally {
    if (context && recorder) {
      try {
        await recorder.stop(context, controller.signal.aborted);
      } catch (cause) {
        status = 'failed';
        error = `${error ? `${error}\n` : ''}无法保存执行录像：${errorMessage(cause)}`;
      }
    }
    await browser?.close().catch(() => {});
    clearInterval(heartbeatTimer);
    clearTimeout(deadline);
    controller.signal.removeEventListener('abort', abort);
    if (controller.signal.aborted) {
      const current = await getRun(run.id).catch(() => undefined);
      cancelled ||= current?.cancelRequested ?? false;
      status = cancelled ? 'cancelled' : 'failed';
      error ||= errorMessage(controller.signal.reason);
    }
    jobs.delete(run.id);
    await finishRun(run.id, status, error);
  }
}
