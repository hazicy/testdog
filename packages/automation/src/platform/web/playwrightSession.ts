import { SecretInputs } from '@testdog/contracts/automation/platform/inputs';
import { expect as playwrightExpect } from '@playwright/test';
import { recordAction } from '@testdog/automation/platform/web/recordingLocator';
import type { Page } from 'playwright';
import { BrowserSession } from '@testdog/automation/platform/web/browserSession';
import { Observer } from '@testdog/automation/platform/web/observer';
import { executeWebAction } from '@testdog/automation/platform/web/webActions';
import { locateWebElement } from '@testdog/automation/platform/web/webLocator';
import type { ExecutionHooks } from '@testdog/contracts/runs/types';
import type {
  AutomationSession,
  Observation,
  PlatformAction,
  SessionEvent,
  PlatformAssertion,
  CaptureRequest,
  ArtifactDescriptor,
  ReplayStep,
} from '@testdog/contracts/automation/platform/contracts';

export class PlaywrightSession implements AutomationSession {
  readonly platform = 'web' as const;
  readonly executionPolicy = { reobserveAfterAction: false };
  readonly capabilities = {
    actions: ['navigate', 'click', 'fill', 'press', 'wait', 'screenshot'],
    artifacts: ['screenshot', 'snapshot', 'video', 'trace', 'console', 'network'],
    assertions: ['semantic', 'visible', 'text', 'containsText', 'value', 'url'],
    observations: ['aria-tree', 'url', 'focused-element'],
  };
  private session: BrowserSession;
  private observer = new Observer();
  private disposed = false;
  private observation?: Observation;
  private pages = new Map<string, Page>();
  private registerPage = (page: Page) => {
    this.pages.set(`page-${this.pages.size + 1}`, page);
  };
  constructor(
    readonly id: string,
    page: Page,
    private hooks: ExecutionHooks = {},
    private useTouch = false,
    private secrets = new SecretInputs(),
    private captureEvidence?: (session: AutomationSession, event: SessionEvent) => Promise<void>,
  ) {
    this.session = new BrowserSession(page);
    page.context().pages().forEach(this.registerPage);
    page.context().on('page', this.registerPage);
  }
  async selectSurface(id: string, signal: AbortSignal) {
    const deadline = Date.now() + 15000;

    while (!this.pages.has(id) && Date.now() < deadline) {
      signal.throwIfAborted();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    signal.throwIfAborted();
    const page = this.pages.get(id);

    if (!page || page.isClosed()) throw new Error(`重放页面 ${id} 不存在`);
    this.session.activate(page);
  }
  async prepareReplayStep(step: ReplayStep, signal: AbortSignal) {
    signal.throwIfAborted();
    const action = step.event.action;

    if (action && action.platform !== this.platform) throw new Error('Expected Web action');
    const browserAction = action?.action;

    // A popup wait belongs to the preceding action's page, even if the popup is already open.
    if (!(browserAction?.type === 'wait' && browserAction.condition === 'newPage')) {
      if (!step.surfaceId) throw new Error('重放步骤缺少页面 ID');
      await this.selectSurface(step.surfaceId, signal);
    }

    if (
      browserAction &&
      browserAction.type !== 'navigate' &&
      browserAction.type !== 'wait' &&
      browserAction.target.kind === 'ariaRef'
    )
      throw new Error('该步骤没有稳定定位器，请重新录制');
  }
  get latestObservation() {
    return this.observation;
  }
  get revision() {
    return this.session.version;
  }
  async observe(signal: AbortSignal): Promise<Observation> {
    signal.throwIfAborted();
    const observation = await this.session.observe(this.observer);

    signal.throwIfAborted();

    return (this.observation = {
      ...observation,
      tree: this.secrets.redactData(observation.tree),
      page: this.secrets.redactData(observation.page),
      schemaVersion: 1,
      sessionId: this.id,
      revision: this.revision,
      capturedAt: new Date().toISOString(),
      surface: {
        platform: 'web',
        id: [...this.pages].find(([, page]) => page === this.session.page)![0],
        url: this.secrets.redact(this.session.page.url()),
      },
    });
  }
  async perform(step: PlatformAction, signal: AbortSignal) {
    signal.throwIfAborted();
    if (step.platform !== 'web') throw new Error('Expected Web action');
    let action = step.action;

    if (action.type === 'fill') {
      const input = this.secrets.resolve(action.value);

      if (input.sensitive) {
        const locator = locateWebElement(this.session.page, action.target);

        if (
          !(await locator.evaluate(
            (element) => element instanceof HTMLInputElement && element.type === 'password',
          ))
        )
          throw new Error('Secret inputs require a password field');
        await locator.evaluate((element) => element.setAttribute('data-caseforge-secret', 'true'));
        action = { ...action, value: input.value };
      }
    }

    if (action.type === 'wait') await this.session.wait(action);
    else await this.session.perform((page) => executeWebAction(page, action, this.useTouch));
    signal.throwIfAborted();
  }
  async wait(action: PlatformAction, signal: AbortSignal) {
    if (action.action.type !== 'wait') throw new Error('Expected wait action');
    await this.perform(action, signal);

    return this.observe(signal);
  }
  async check(assertion: PlatformAssertion, signal: AbortSignal) {
    signal.throwIfAborted();
    if (assertion.platform !== 'web') throw new Error('Assertion platform mismatch');
    try {
      if (assertion.type === 'url') {
        const check = playwrightExpect(this.session.page);

        await (assertion.negate ? check.not : check).toHaveURL(assertion.value!, { timeout: 5000 });
      } else {
        if (!assertion.target) throw new Error('Assertion target required');
        const base = playwrightExpect(locateWebElement(this.session.page, assertion.target));
        const check = assertion.negate ? base.not : base;

        if (assertion.type === 'visible') await check.toBeVisible({ timeout: 5000 });
        else if (assertion.type === 'text')
          await check.toHaveText(assertion.value!, { timeout: 5000 });
        else if (assertion.type === 'containsText')
          await check.toContainText(assertion.value!, { timeout: 5000 });
        else await check.toHaveValue(assertion.value!, { timeout: 5000 });
      }

      signal.throwIfAborted();

      return { passed: true, evidence: `Playwright ${assertion.type} passed` };
    } catch (error) {
      signal.throwIfAborted();

      return { passed: false, evidence: error instanceof Error ? error.message : String(error) };
    }
  }
  async resolveForRecording(action: PlatformAction, observation: Observation) {
    if (
      action.platform !== 'web' ||
      observation.sessionId !== this.id ||
      observation.revision !== this.revision
    )
      throw new Error('Recording observation mismatch');
    const result = await recordAction(this.session.page, action.action);

    return {
      action: { platform: 'web' as const, action: result.action },
      replayable: result.replayable,
    };
  }
  async capture(request: CaptureRequest, signal: AbortSignal): Promise<ArtifactDescriptor[]> {
    signal.throwIfAborted();
    if (request.kind === 'snapshot')
      return [
        {
          kind: 'snapshot',
          bytes: Buffer.from(JSON.stringify(this.secrets.redactData(await this.observe(signal)))),
          contentType: 'application/json',
          producer: 'playwright',
          format: 'caseforge-observation-v1',
        },
      ];
    if (request.kind !== 'screenshot')
      throw new Error('Web video/trace are exported during context finalization');

    return [
      {
        kind: 'screenshot',
        bytes: await this.session.page.screenshot({
          type: 'png',
          timeout: 15000,
          mask: this.secrets.enabled
            ? [
                this.session.page.locator('input[type="password"], [data-caseforge-secret]'),
                ...this.secrets.maskValues.map((value) =>
                  this.session.page.getByText(value, { exact: false }),
                ),
              ]
            : [],
        }),
        contentType: 'image/png',
        producer: 'playwright',
        format: 'png',
      },
    ];
  }
  async emit(event: SessionEvent) {
    event = {
      ...event,
      title: this.secrets.redact(event.title),
      ...(event.error ? { error: this.secrets.redact(event.error) } : {}),
      ...(event.evidence ? { evidence: this.secrets.redact(event.evidence) } : {}),
    };
    const page = this.session.page;

    this.hooks.onPage?.(page);
    await this.hooks.onStep?.(event, page);
    await this.captureEvidence?.(this, event);
  }
  async close() {
    if (!this.disposed) {
      this.disposed = true;
      this.session.page.context().off('page', this.registerPage);
      this.session.dispose();
    }
  }
}
