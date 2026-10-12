import { getBuild } from '@testdog/server/builds/repository';
import { prepareRunLogin } from '@testdog/server/login-identities/runtime';
import { openRunBrowser } from '@testdog/server/browser-providers/runtime';
import type { BrowserConnection } from '@testdog/automation/platform/web/providers/contracts';
import type { ModelClient } from '@testdog/contracts/automation/llm/contracts';
import { SemanticEvaluator, type Evaluator } from '@testdog/automation/evaluator';
import { modelClient } from '@testdog/server/shared/model';
import { previewInterval } from '@testdog/server/realtime/preview';
import { EvidenceSink } from '@testdog/server/runs/evidenceSink';
import { SecretInputs } from '@testdog/contracts/automation/platform/inputs';
import type { Browser, BrowserContext, BrowserContextOptions } from 'playwright';
import type { Plan } from '@testdog/contracts/automation/compiler/schema';
import { AgentDeviceSession } from '@testdog/automation/platform/native/agentDeviceSession';
import { NativeActionPlanner } from '@testdog/automation/platform/native/nativePlanner';
import { PlaywrightSession } from '@testdog/automation/platform/web/playwrightSession';
import { WebActionPlanner } from '@testdog/automation/platform/web/webPlanner';
import { resolveWebProfile } from '@testdog/automation/platform/web/mobile';
import { legacyWebTarget, targetUrl } from '@testdog/contracts/automation/platform/target';
import { DeviceRecorder } from '@testdog/server/runs/deviceRecorder';
import { RunRecorder } from '@testdog/server/runs/recorder';
import { PersistenceQueue } from '@testdog/server/runs/persistenceQueue';
import { cleanupRuntime, finalizeRuntime } from '@testdog/server/runs/finalizeRuntime';
import type { TestRun } from '@testdog/contracts/runs/types';
import type {
  AutomationSession,
  ActionPlanner,
  PlatformAction,
} from '@testdog/contracts/automation/platform/contracts';

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
  const secrets = new SecretInputs(run.authenticationVerification ? {} : target.inputs);

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
      getBuild,
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
  let connection: BrowserConnection | undefined;
  let context: BrowserContext | undefined;
  let recorder: RunRecorder | undefined;
  const stop = () => {
    // Close the context to interrupt actions but keep the transport alive until
    // the recorder has downloaded remote video artifacts.
    if (context) void context.close().catch(() => {});
    else void connection?.close().catch(() => {});
  };

  signal.addEventListener('abort', stop, { once: true });
  try {
    connection = await openRunBrowser(run.id, target, signal);
    browser = connection.browser;
    signal.throwIfAborted();
    if (
      expectedEnvironment?.browserVersion &&
      expectedEnvironment.browserVersion !== browser.version()
    )
      throw new Error('浏览器版本与录制不兼容，请重新录制');
    const login = await prepareRunLogin({
      runId: run.id,
      target,
      browser,
      provider: connection.provider,
      profile,
      model,
      signal,
      forceRefresh: run.authenticationVerification,
      report: input.report,
    });
    // Authenticated request headers in traces can expose reusable session credentials.
    const artifacts = connection.artifacts.filter(
      (kind) => !target.loginIdentityId || kind !== 'trace',
    );
    const persistence = new PersistenceQueue();

    recorder = new RunRecorder(run, persistence);
    context = await browser.newContext({
      ...profile,
      ...(login.storageState ? { storageState: login.storageState } : {}),
      ...(secrets.enabled || !connection.artifacts.includes('video')
        ? {}
        : { recordVideo: { dir: recorder.directory, size: profile.viewport ?? undefined } }),
    });
    context.setDefaultTimeout(15000);
    const page = await context.newPage();

    await recorder.start(context, artifacts);
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

    session.capabilities.artifacts = artifacts.filter(
      (artifact) => !secrets.enabled || !['video', 'trace'].includes(artifact),
    );
    let browserCleanup: Promise<void> | undefined;

    const runtime: PlatformRuntime = {
      session,
      evaluator: new SemanticEvaluator(model),
      planner: new WebActionPlanner(model, signal),
      environment: {
        platform: 'web',
        browserProvider: connection.provider,
        ...(login.preparation ? { loginPreparation: login.preparation } : {}),
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
        return (browserCleanup ??= connection!.close().then(() => {
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
        await connection?.close();
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
