import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { errors, type Browser, type BrowserContextOptions } from 'playwright';
import { db } from '@/db';
import { loginIdentities, testRuns } from '@/db/schema';
import { identityFor, loginFlow } from './repository';
import { readCachedLoginState, withLoginRefreshLock, type LoginState } from './cache';
import { SecretInputs } from '@/automation/platform/inputs';
import { resolvePlanInputs } from '@/automation/compiler/executionPlan';
import { PlaywrightSession } from '@/automation/platform/web/playwrightSession';
import { WebActionPlanner } from '@/automation/platform/web/webPlanner';
import { SemanticEvaluator } from '@/automation/evaluator';
import { PlanRunner } from '@/automation/planRunner';
import type { WebTarget } from '@/automation/platform/target';
import type { ModelClient } from '@/automation/llm/contracts';
import type { LoginPreparation } from '@/features/login-identities/types';

export class LoginPreparationError extends Error {
  constructor() {
    super('登录准备失败，业务步骤尚未开始。请检查登录流程、成功标志和账号密钥。');
  }
}

export async function prepareRunLogin(input: {
  runId: string;
  target: WebTarget;
  browser: Browser;
  provider: string;
  profile: BrowserContextOptions;
  model: ModelClient;
  signal: AbortSignal;
  forceRefresh?: boolean;
  report: (message: string) => Promise<void>;
}): Promise<{ storageState?: LoginState; preparation?: LoginPreparation }> {
  const { target, signal, browser, profile, model, report } = input;

  if (!target.loginIdentityId) return {};
  const [run] = await db
    .select({ userId: testRuns.userId })
    .from(testRuns)
    .where(eq(testRuns.id, input.runId));

  if (!run) throw new LoginPreparationError();
  const identity = await identityFor(target.loginIdentityId, run.userId);
  let failedStep = '';
  let setupContext: Awaited<ReturnType<Browser['newContext']>> | undefined;
  const stop = () => {
    void setupContext?.close().catch(() => {});
  };

  signal.addEventListener('abort', stop, { once: true });
  const outcome = async (state: LoginState, reused: boolean) => {
    signal.throwIfAborted();
    await db
      .update(loginIdentities)
      .set({ lastError: null, lastVerifiedAt: new Date().toISOString() })
      .where(
        and(eq(loginIdentities.id, identity.id), eq(loginIdentities.version, identity.version)),
      );
    await report(reused ? '已复用登录身份，开始执行。' : '登录准备完成，开始执行。');

    return {
      storageState: state,
      preparation: {
        identityId: identity.id,
        name: identity.name,
        version: identity.version,
        reused,
      },
    };
  };

  try {
    if (new URL(target.url).origin !== new URL(identity.website).origin) throw new Error();
    const flow = await loginFlow(identity);
    const inputs = { ...flow.target.inputs, ...identity.inputs };
    const secrets = new SecretInputs(inputs);
    // PostgreSQL jsonb may reorder the replay profile's keys. Equivalent settings
    // must reuse the same state in recordings and replays.
    const profileKey = JSON.stringify(profile, (_key, value: unknown) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).sort(([left], [right]) =>
              left < right ? -1 : left > right ? 1 : 0,
            ),
          )
        : value,
    );
    const key = createHash('sha256')
      .update(
        JSON.stringify([
          identity.id,
          identity.version,
          flow.updatedAt,
          input.provider,
          target.browser,
          profileKey,
        ]),
      )
      .digest('hex');
    const check = async (state: LoginState) => {
      setupContext = await browser.newContext({ ...profile, storageState: state });
      try {
        signal.throwIfAborted();
        const page = await setupContext.newPage();

        await page.goto(identity.checkUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        if (new URL(page.url()).origin !== new URL(identity.website).origin) return undefined;
        try {
          await page
            .getByText(identity.successText, { exact: true })
            .first()
            .waitFor({ state: 'visible', timeout: 3000 });
        } catch (error) {
          if (error instanceof errors.TimeoutError) return undefined;
          throw error;
        }

        return await setupContext.storageState({ indexedDB: true });
      } finally {
        await setupContext.close();
        setupContext = undefined;
      }
    };

    await report(`正在检查登录身份：${identity.name}…`);
    if (!input.forceRefresh) {
      const cached = await readCachedLoginState(key, run.userId);
      const valid = cached && (await check(cached));

      if (valid) return await outcome(valid, true);
    }

    return await withLoginRefreshLock(key, identity.id, signal, async (publish) => {
      // Another worker may have refreshed while this one waited for the lock.
      if (!input.forceRefresh) {
        const cached = await readCachedLoginState(key, run.userId);
        const valid = cached && (await check(cached));

        if (valid) return outcome(valid, true);
      }

      await report('登录身份未就绪或已失效，正在执行登录流程…');
      setupContext = await browser.newContext(profile);
      let session: PlaywrightSession | undefined;

      try {
        signal.throwIfAborted();
        const page = await setupContext.newPage();

        session = new PlaywrightSession(
          `login:${input.runId}`,
          page,
          {
            signal,
            onStep: async (event) => {
              if (event.phase === 'error') failedStep = event.title;
            },
          },
          profile.hasTouch,
          secrets,
        );
        const runner = new PlanRunner({
          plan: resolvePlanInputs(flow.plan, inputs),
          session,
          planner: new WebActionPlanner(model, signal),
          evaluator: new SemanticEvaluator(model),
          signal,
          report: (message) => {
            const safe = secrets.redact(message);

            if (safe.startsWith('执行任务：')) failedStep = safe;

            return report(`登录准备：${safe}`);
          },
        });

        await runner.record({
          platform: 'web',
          action: {
            type: 'navigate',
            target: { kind: 'css', value: '', name: '' },
            value: flow.target.url,
          },
        });
        failedStep = '登录成功标志未出现';
        const verificationPage = await setupContext.newPage();

        await verificationPage.goto(identity.checkUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        if (new URL(verificationPage.url()).origin !== new URL(identity.website).origin)
          throw new Error();
        await verificationPage
          .getByText(identity.successText, { exact: true })
          .first()
          .waitFor({ state: 'visible', timeout: 5000 });
        const state = await setupContext.storageState({ indexedDB: true });

        failedStep = '保存登录态';
        await publish(state, identity.ttlMinutes);
        await db
          .update(loginIdentities)
          .set({ lastVerifiedAt: new Date().toISOString(), lastError: null })
          .where(
            and(eq(loginIdentities.id, identity.id), eq(loginIdentities.version, identity.version)),
          );

        return await outcome(state, false);
      } finally {
        await session?.close();
        await setupContext.close();
        setupContext = undefined;
      }
    });
  } catch {
    await db
      .update(loginIdentities)
      .set({
        lastError: `登录准备失败${failedStep ? `：${failedStep}` : '，请检查登录流程、成功标志和账号密钥。'}`,
      })
      .where(
        and(eq(loginIdentities.id, identity.id), eq(loginIdentities.version, identity.version)),
      );
    await report('登录准备失败，业务步骤未开始。');
    if (signal.aborted) signal.throwIfAborted();
    throw new LoginPreparationError();
  } finally {
    signal.removeEventListener('abort', stop);
    await setupContext?.close().catch(() => {});
  }
}
