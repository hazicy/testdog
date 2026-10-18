import type { PlatformRuntime, RuntimeInput } from '@testdog/server/runs/runtimeTypes';
import { RuntimeOpenError } from '@testdog/server/runs/runtimeTypes';
import { modelClient } from '@testdog/server/shared/model';
import { SemanticEvaluator } from '@testdog/automation/evaluator';
import { openRunBrowser } from '@testdog/server/browser-providers/runtime';
import type { BrowserConnection } from '@testdog/automation/platform/web/providers/contracts';
import type { BrowserContext, BrowserContextOptions } from 'playwright';
import { PlaywrightSession } from '@testdog/automation/platform/web/playwrightSession';
import { WebActionPlanner } from '@testdog/automation/platform/web/webPlanner';
import { HybridWebActionPlanner } from '@testdog/automation/platform/web/hybridPlanner';
import { JevActionPlanner } from '@testdog/automation/platform/web/jevActionPlanner';
import { resolveWebProfile } from '@testdog/automation/platform/web/mobile';
import type { WebTarget } from '@testdog/contracts/automation/platform/target';
import { RunRecorder } from '@testdog/server/runs/recorder';
import { PersistenceQueue } from '@testdog/server/runs/persistenceQueue';
import { cleanupRuntime } from '@testdog/server/runs/finalizeRuntime';

export async function openWebRuntime(
  input: RuntimeInput,
  target: WebTarget,
): Promise<PlatformRuntime> {
  const { run, expectedEnvironment, signal } = input;
  const model = input.model ?? modelClient;
  const agentMode = process.env.TESTDOG_WEB_AGENT;
  const jevFirst = ['hybrid', 'jev'].includes(agentMode ?? '') && run.mode !== 'replay';
  const legacyHybrid = agentMode === 'hybrid-legacy' && run.mode !== 'replay';
  const profile = expectedEnvironment?.profile
    ? (expectedEnvironment.profile as BrowserContextOptions)
    : resolveWebProfile(target);
  let connection: BrowserConnection | undefined;
  let context: BrowserContext | undefined;
  const stop = () => {
    // Close the context to interrupt actions but keep the transport alive until
    // the recorder has downloaded remote video artifacts.
    if (context) void context.close().catch(() => {});
    else void connection?.close().catch(() => {});
  };

  signal.addEventListener('abort', stop, { once: true });
  try {
    if (process.env.TESTDOG_WEB_AGENT && !['hybrid', 'jev', 'hybrid-legacy', 'llm'].includes(process.env.TESTDOG_WEB_AGENT))
      throw new Error('TESTDOG_WEB_AGENT 必须是 llm、hybrid、jev 或 hybrid-legacy');
    if ((jevFirst || legacyHybrid) && !process.env.JEV_API_KEY?.trim())
      throw new Error('混合 DOM Agent 需要配置 JEV_API_KEY');
    connection = await openRunBrowser(run.id, target, signal);
    const browser = connection.browser;

    signal.throwIfAborted();
    if (
      expectedEnvironment?.browserVersion &&
      expectedEnvironment.browserVersion !== browser.version()
    )
      throw new Error('浏览器版本与录制不兼容，请重新录制');
    const artifacts = connection.artifacts;
    const persistence = new PersistenceQueue();
    const recorder = new RunRecorder(run, persistence);

    context = await browser.newContext({
      ...profile,
      serviceWorkers: 'block',
      ...(!connection.artifacts.includes('video')
        ? {}
        : { recordVideo: { dir: recorder.directory, size: profile.viewport ?? undefined } }),
    });
    context.setDefaultTimeout(15000);
    const page = await context.newPage();

    await recorder.start(context, artifacts);
    recorder.onPage(page);
    const hooks = { signal, onPage: recorder.onPage, onStep: recorder.onStep };
    const session = new PlaywrightSession(run.id, page, hooks, profile.hasTouch);

    session.capabilities.artifacts = artifacts;
    let browserCleanup: Promise<void> | undefined;

    const runtime: PlatformRuntime = {
      session,
      evaluator: new SemanticEvaluator(model),
      planner: jevFirst
        ? new JevActionPlanner(model, signal)
        : legacyHybrid
          ? new HybridWebActionPlanner(model, session, signal)
          : new WebActionPlanner(model, signal),
      environment: {
        platform: 'web',
        browserProvider: connection.provider,
        browser: target.browser,
        browserVersion: browser.version(),
        profile,
        driverVersion: '1.63.0',
      },
      healthy: false,
      cleanup() {
        return (browserCleanup ??= connection!.close().then(() => {
          runtime.healthy = true;
        }));
      },
      async finalize(interrupted) {
        signal.removeEventListener('abort', stop);
        await session.close();
        await recorder.stop(context!, interrupted);
      },
    };

    return runtime;
  } catch (error) {
    signal.removeEventListener('abort', stop);
    const cleanup = {
      healthy: !connection,
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
