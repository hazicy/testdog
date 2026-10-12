import type { ModelClient } from '@/automation/llm/contracts';
import { SemanticEvaluator, type Evaluator } from '@/automation/evaluator';
import { modelClient } from '@/server/shared/model';
import { previewInterval } from '@/server/realtime/preview';
import { EvidenceSink } from '@/server/runs/evidenceSink';
import { SecretInputs } from '@/automation/platform/inputs';
import type { Browser, BrowserContext, BrowserContextOptions } from 'playwright';
import type { Plan } from '@/automation/compiler/schema';
import { AgentDeviceSession } from '@/automation/platform/native/agentDeviceSession';
import { NativeActionPlanner } from '@/automation/platform/native/nativePlanner';
import { PlaywrightSession } from '@/automation/platform/web/playwrightSession';
import { WebActionPlanner } from '@/automation/platform/web/webPlanner';
import { launchWebBrowser, resolveWebProfile } from '@/automation/platform/web/mobile';
import { legacyWebTarget, targetUrl } from '@/automation/platform/target';
import { DeviceRecorder } from '@/server/runs/deviceRecorder';
import { RunRecorder } from '@/server/runs/recorder';
import { PersistenceQueue } from '@/server/runs/persistenceQueue';
import { cleanupRuntime, finalizeRuntime } from './finalizeRuntime';
import type { TestRun } from '@/features/runs/types';
import type {
  AutomationSession,
  ActionPlanner,
  PlatformAction,
} from '@/automation/platform/contracts';

export interface PlatformRuntime {
  session: AutomationSession;
  planner: ActionPlanner;
  evaluator: Evaluator;
  environment: Record<string, unknown>;
  initial?: PlatformAction;
  finalize(interrupted: boolean): Promise<void>;
  cleanup?(): Promise<void>;
  healthy: boolean;
}

export class RuntimeOpenError extends Error {
  constructor(
    cause: unknown,
    public healthy: boolean,
  ) {
    super('执行环境准备失败', { cause });
  }
}

export async function openPlatformRuntime(input: {
  model?: ModelClient;
  run: TestRun;
  plan: Plan;
  expectedEnvironment?: Record<string, unknown>;
  resource?: { deviceId: string | null; metadata: Record<string, unknown> };
  signal: AbortSignal;
  report: (message: string) => Promise<void>;
}): Promise<PlatformRuntime> {
  const { run, expectedEnvironment, resource, signal } = input;
  const model = input.model ?? modelClient;
  const target = run.targetSnapshot ?? legacyWebTarget(run.url);
  const secrets = new SecretInputs(target.inputs);

  if (target.platform !== 'web') {
    if (!resource?.deviceId) throw new Error('设备租约没有绑定设备 ID');
    const recorder = new DeviceRecorder(run);
    const session = await AgentDeviceSession.open(
      `${run.id}-${run.attempt ?? 1}`,
      target,
      resource.deviceId,
      signal,
      recorder.onEvent,
      undefined,
      expectedEnvironment,
    ).catch((error) => {
      throw new RuntimeOpenError(error, false);
    });
    let live: ReturnType<typeof setInterval> | undefined;
    let closing: Promise<void> | undefined;
    const runtime: PlatformRuntime = {
      session,
      evaluator: new SemanticEvaluator(model),
      planner: new NativeActionPlanner(model, target.platform, signal),
      environment: session.environment,
      healthy: false,
      cleanup() {
        clearInterval(live);

        return (closing ??= session.close().then(() => {
          runtime.healthy = session.safeToRelease;
        }));
      },
      async finalize() {
        clearInterval(live);
        const failures: unknown[] = [];

        for (const job of [
          () => recorder.drain(),
          () => recorder.capture(session, 'final'),
          () => recorder.finalizeDiagnostics(session),
        ]) {
          try {
            await job();
          } catch (error) {
            failures.push(error);
          }
        }

        if (failures.length) throw new AggregateError(failures, 'Native evidence incomplete');
      },
    };

    try {
      const observation = await session.observe(signal);

      if (expectedEnvironment) {
        for (const key of ['osVersion', 'driverVersion', 'buildSha256']) {
          if (!expectedEnvironment[key] || expectedEnvironment[key] !== session.environment[key])
            throw new Error(`设备 ${key} 与录制不兼容，请重新录制`);
        }

        if (
          expectedEnvironment.viewport &&
          JSON.stringify(expectedEnvironment.viewport) !== JSON.stringify(observation.viewport)
        )
          throw new Error('设备屏幕与录制不兼容');
      }

      runtime.environment.viewport = observation.viewport;
      if (!secrets.enabled) live = setInterval(() => recorder.sample(session), previewInterval());

      return runtime;
    } catch (error) {
      try {
        await finalizeRuntime(runtime, true);
      } catch (cleanupError) {
        throw new RuntimeOpenError(
          new AggregateError([error, cleanupError], '准备与归档或清理失败'),
          runtime.healthy,
        );
      }

      throw new RuntimeOpenError(error, runtime.healthy);
    }
  }

  const profile = expectedEnvironment?.profile
    ? (expectedEnvironment.profile as BrowserContextOptions)
    : resolveWebProfile(target);
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let recorder: RunRecorder | undefined;
  const stop = () => {
    void browser?.close().catch(() => {});
  };

  signal.addEventListener('abort', stop, { once: true });
  try {
    browser = await launchWebBrowser(target);
    signal.throwIfAborted();
    if (
      expectedEnvironment?.browserVersion &&
      expectedEnvironment.browserVersion !== browser.version()
    )
      throw new Error('浏览器版本与录制不兼容，请重新录制');
    const persistence = new PersistenceQueue();

    recorder = new RunRecorder(run, persistence);
    context = await browser.newContext({
      ...profile,
      ...(secrets.enabled
        ? {}
        : { recordVideo: { dir: recorder.directory, size: profile.viewport ?? undefined } }),
    });
    context.setDefaultTimeout(15000);
    const page = await context.newPage();

    await recorder.start(context);
    recorder.onPage(page);
    const hooks = { signal, onPage: recorder.onPage, onStep: recorder.onStep };
    const evidence = new EvidenceSink(run, persistence);
    const session = new PlaywrightSession(
      run.id,
      page,
      hooks,
      profile.hasTouch,
      secrets,
      (session, event) =>
        evidence.capture(
          session,
          { kind: 'snapshot' },
          event.phase === 'start' ? 'before' : 'after',
          event.id,
        ),
    );

    if (secrets.enabled)
      session.capabilities.artifacts = ['screenshot', 'snapshot', 'console', 'network'];
    let browserCleanup: Promise<void> | undefined;

    const runtime: PlatformRuntime = {
      session,
      evaluator: new SemanticEvaluator(model),
      planner: new WebActionPlanner(model, signal),
      environment: {
        platform: 'web',
        browser: target.browser,
        browserVersion: browser.version(),
        profile,
        driverVersion: '1.63.0',
      },
      initial: targetUrl(target)
        ? {
            platform: 'web',
            action: {
              type: 'navigate',
              target: { kind: 'css', value: '', name: '' },
              value: targetUrl(target),
            },
          }
        : undefined,
      healthy: false,
      cleanup() {
        return (browserCleanup ??= browser!.close().then(() => {
          runtime.healthy = true;
        }));
      },
      async finalize(interrupted) {
        signal.removeEventListener('abort', stop);
        await session.close();
        await recorder!.stop(context!, interrupted);

        evidence.assertComplete();
      },
    };

    return runtime;
  } catch (error) {
    signal.removeEventListener('abort', stop);
    const cleanup = {
      healthy: !browser,
      cleanup: async () => {
        await browser?.close();
        cleanup.healthy = true;
      },
    };

    try {
      await cleanupRuntime(cleanup);
    } catch (cleanupError) {
      throw new RuntimeOpenError(
        new AggregateError([error, cleanupError], '准备与清理失败'),
        cleanup.healthy,
      );
    }

    throw new RuntimeOpenError(error, cleanup.healthy);
  }
}
