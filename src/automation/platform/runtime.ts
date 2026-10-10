import { EvidenceSink } from '@/workspace/server/evidenceSink';
import { SecretInputs } from './inputs';
import type { Browser, BrowserContext, BrowserContextOptions } from 'playwright';
import type { Plan } from '../compiler/schema';
import { Planner } from '../planner';
import { AgentDeviceSession } from './agentDeviceSession';
import { NativeActionPlanner } from './nativePlanner';
import { PlaywrightSession, WebActionPlanner } from './playwrightSession';
import { launchWebBrowser, resolveWebProfile } from './mobile';
import { legacyWebTarget } from './target';
import { DeviceRecorder } from '@/workspace/server/deviceRecorder';
import { RunRecorder } from '@/workspace/server/recorder';
import { PersistenceQueue } from '@/workspace/server/persistenceQueue';
import type { TestRun } from '@/workspace/types';
import type { AutomationSession, ActionPlanner, PlatformAction } from './contracts';

export interface PlatformRuntime {
  session: AutomationSession;
  planner: ActionPlanner;
  environment: Record<string, unknown>;
  initial?: PlatformAction;
  finalize(interrupted: boolean): Promise<void>;
  healthy: boolean;
}

export async function openPlatformRuntime(input: {
  run: TestRun;
  plan: Plan;
  source?: TestRun;
  resource?: { deviceId: string | null; metadata: Record<string, unknown> };
  signal: AbortSignal;
  report: (message: string) => Promise<void>;
}): Promise<PlatformRuntime> {
  const { run, source, resource, signal } = input;
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
      source?.environmentSnapshot,
    );
    let live: ReturnType<typeof setInterval> | undefined;
    const runtime: PlatformRuntime = {
      session,
      planner: new NativeActionPlanner(target.platform, signal),
      environment: session.environment,
      healthy: false,
      async finalize() {
        clearInterval(live);
        const failures: unknown[] = [];
        try {
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
        } finally {
          await session.close();
          runtime.healthy = session.safeToRelease;
        }
        if (failures.length) throw new AggregateError(failures, 'Native evidence incomplete');
      },
    };
    try {
      const observation = await session.observe(signal);
      if (source?.environmentSnapshot) {
        for (const key of ['osVersion', 'driverVersion', 'buildSha256']) {
          if (
            !source.environmentSnapshot[key] ||
            source.environmentSnapshot[key] !== session.environment[key]
          )
            throw new Error(`设备 ${key} 与录制不兼容，请重新录制`);
        }
        if (
          source.environmentSnapshot.viewport &&
          JSON.stringify(source.environmentSnapshot.viewport) !==
            JSON.stringify(observation.viewport)
        )
          throw new Error('设备屏幕与录制不兼容');
      }
      runtime.environment.viewport = observation.viewport;
      if (!secrets.enabled) live = setInterval(() => recorder.sample(session), 2000);

      return runtime;
    } catch (error) {
      await runtime.finalize(true).catch(() => {});
      throw error;
    }
  }
  const profile = source?.environmentSnapshot?.profile
    ? (source.environmentSnapshot.profile as BrowserContextOptions)
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
      source?.environmentSnapshot?.browserVersion &&
      source.environmentSnapshot.browserVersion !== browser.version()
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
    const runtime: PlatformRuntime = {
      session,
      planner: new WebActionPlanner(new Planner(signal)),
      environment: {
        platform: 'web',
        browser: target.browser,
        browserVersion: browser.version(),
        profile,
        driverVersion: '1.63.0',
      },
      initial: run.url
        ? {
            platform: 'web',
            action: {
              type: 'navigate',
              target: { kind: 'css', value: '', name: '' },
              value: run.url,
            },
          }
        : undefined,
      healthy: false,
      async finalize(interrupted) {
        signal.removeEventListener('abort', stop);
        await session.close();
        try {
          await recorder!.stop(context!, interrupted);
        } finally {
          await browser!.close();
          runtime.healthy = true;
        }
        evidence.assertComplete();
      },
    };

    return runtime;
  } catch (error) {
    signal.removeEventListener('abort', stop);
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    throw error;
  }
}
