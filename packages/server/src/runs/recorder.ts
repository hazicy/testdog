import { SecretInputs } from '@testdog/contracts/automation/platform/inputs';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import type {
  ExecutionStep,
  RunArtifact,
  StepSignal,
  TestRun,
} from '@testdog/contracts/runs/types';
import { insertArtifact, insertStep, finishStep } from '@testdog/server/runs/repository';
import { BrowserLogs } from '@testdog/server/runs/browserLogs';
import { recordAction } from '@testdog/automation/platform/web/recordingLocator';
import { artifactRoot } from '@testdog/server/runs/artifactStorage';
import { PersistenceQueue } from '@testdog/server/runs/persistenceQueue';
import {
  hasPreviewViewers,
  previewInterval,
  publishPreview,
} from '@testdog/server/realtime/preview';

export class RunRecorder {
  private page?: Page;
  private secrets: SecretInputs;
  private logs: BrowserLogs;
  private activeSteps = new Map<Page, string>();
  private pages = new Map<Page, string>();
  private steps = new Map<string, ExecutionStep>();
  private sequence = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  private captureError?: unknown;
  private livePending = false;
  private lastCapturedAt = 0;
  private stopping?: Promise<void>;
  private recordTrace = true;
  readonly directory: string;
  constructor(
    private run: TestRun,
    private persistence = new PersistenceQueue(),
  ) {
    this.secrets = new SecretInputs(
      run.authenticationVerification ? {} : run.targetSnapshot.inputs,
    );
    this.logs = new BrowserLogs(
      run.id,
      run.startedAt,
      (page) => ({
        pageId: this.pageId(page),
        stepId: this.activeSteps.get(page),
      }),
      this.secrets,
    );
    this.directory = join(artifactRoot(), run.id);
  }
  pageId = (page: Page) => {
    if (!this.pages.has(page)) this.pages.set(page, `page-${this.pages.size + 1}`);

    return this.pages.get(page)!;
  };
  onPage = (page: Page) => {
    this.pageId(page);
    this.page = page;
  };
  private activePage() {
    if (this.page && !this.page.isClosed()) return this.page;
    this.page = [...this.pages.keys()].reverse().find((page) => !page.isClosed());

    return this.page;
  }
  async prepare() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
  }
  async start(context: BrowserContext, artifacts?: string[]) {
    this.recordTrace = !artifacts || artifacts.includes('trace');
    await this.prepare();
    this.logs.start(context);
    context.pages().forEach(this.onPage);
    context.on('page', this.onPage);
    if (!this.secrets.enabled && this.recordTrace)
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    this.timer = setInterval(() => {
      const page = this.activePage();

      if (page && !this.livePending && !this.persistence.busy && !this.activeSteps.size) {
        this.livePending = true;
        void hasPreviewViewers(this.run.id)
          .then((watching) => (watching ? this.capture(page, 'live') : undefined))
          .catch(() => {})
          .finally(() => {
            this.livePending = false;
          });
      }
    }, previewInterval());
  }
  onStep = async (event: StepSignal, page: Page) => {
    if (this.captureError) throw this.captureError;
    this.persistence.assertComplete();
    if (event.phase === 'start') {
      this.activeSteps.set(page, event.id);
      const recorded = event.action
        ? await recordAction(page, event.action).catch(() => ({
            action: event.action!,
            replayable: false,
          }))
        : undefined;
      const step: ExecutionStep = {
        id: event.id,
        runId: this.run.id,
        sequence: ++this.sequence,
        kind: event.kind,
        planNodeId: event.planNodeId,
        title:
          recorded?.action && 'target' in recorded.action && recorded.action.type !== 'navigate'
            ? `${event.title} · ${recorded.action.target.name || recorded.action.target.value}`
            : event.title,
        status: 'running',
        startedAt: new Date().toISOString(),
        pageId: this.pageId(page),
        pageUrl: page.url(),
        action: recorded?.action,
        replayable: recorded?.replayable ?? true,
        assertion: event.assertion,
        platformAssertion: event.platformAssertion,
        playwrightAssertion: event.playwrightAssertion,
        condition: event.condition,
      };

      this.steps.set(event.id, step);
      await insertStep(step);
      await this.capture(page, 'before', event.id);
    } else {
      const step = this.steps.get(event.id);

      if (!step) return;
      const finishedAt = new Date().toISOString();

      await finishStep(step.id, {
        status: event.phase === 'error' ? 'failed' : 'passed',
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(step.startedAt),
        evidence: event.evidence,
        decision: event.decision,
        error: event.error,
      });
      await this.capture(page, 'after', event.id);
      this.activeSteps.delete(page);
    }
  };
  capture(page: Page, stage: RunArtifact['stage'], stepId?: string) {
    if (this.stopping && stage !== 'final') return Promise.resolve();
    const operation = this.queue.then(async () => {
      if (page.isClosed()) return;
      if (
        stage === 'live' &&
        (this.activeSteps.size ||
          this.persistence.busy ||
          Date.now() - this.lastCapturedAt < previewInterval())
      )
        return;
      const id = randomUUID();
      const capturedAt = new Date().toISOString();
      let bytes: Buffer;

      try {
        bytes = await page.screenshot({
          type: 'jpeg',
          quality: stage === 'live' ? 55 : 72,
          timeout: 3000,
          mask: this.secrets.enabled
            ? [
                page.locator('input[type=password], [data-caseforge-secret]'),
                ...this.secrets.maskValues.map((value) => page.getByText(value, { exact: false })),
              ]
            : undefined,
        });
      } catch (error) {
        if (page.isClosed() || /Target.*closed|navigation|Execution context/.test(String(error)))
          return;
        throw error;
      }

      this.lastCapturedAt = Date.now();
      if (stage === 'live') {
        await publishPreview(this.run.id, bytes, 'image/jpeg');

        return;
      }

      const path = join(this.directory, `${id}.jpg`);

      await writeFile(path, bytes, { mode: 0o600 });
      const artifact: RunArtifact = {
        id,
        runId: this.run.id,
        stepId,
        kind: 'screenshot',
        stage,
        pageId: this.pageId(page),
        pageUrl: page.url(),
        capturedAt,
        elapsedMs: Date.parse(capturedAt) - Date.parse(this.run.startedAt),
        contentType: 'image/jpeg',
        size: bytes.length,
      };

      await this.persistence.enqueue(async () => {
        await insertArtifact(artifact, path);
      });
    });

    this.queue = operation.catch((error) => {
      if (stage !== 'live') this.captureError ??= error;
    });

    return operation;
  }
  stop(context: BrowserContext, interrupted = false) {
    return (this.stopping ??= this.archive(context, interrupted));
  }
  private async archive(context: BrowserContext, interrupted: boolean) {
    if (this.timer) clearInterval(this.timer);
    context.off('page', this.onPage);
    const errors: unknown[] = [];
    const attempt = async (operation: () => Promise<unknown>) => {
      try {
        await operation();
      } catch (error) {
        errors.push(error);
      }
    };

    // Stop periodic log writes before draining evidence or exporting trace/video.
    const logsStopped = this.logs.stop(context);

    void logsStopped.catch(() => {});
    await this.queue;
    if (this.captureError) errors.push(this.captureError);
    const page = this.activePage();

    if (!interrupted && page) await attempt(() => this.capture(page, 'final'));
    await attempt(() => this.persistence.drain());
    await attempt(() => logsStopped);
    const trace = join(this.directory, 'trace.zip');

    if (!interrupted && !this.secrets.enabled && this.recordTrace) {
      await attempt(async () => {
        await context.tracing.stop({ path: trace });
        await this.addFile(
          trace,
          'trace',
          'application/zip',
          this.page ? this.pageId(this.page) : 'page-1',
          this.page?.url() || '',
        );
      });
    }

    const videos = [...this.pages].map(([page, id]) => ({
      video: page.video(),
      id,
      url: page.url(),
    }));

    await attempt(() => context.close());
    for (const { video, id, url } of videos)
      if (video)
        await attempt(async () => {
          const path = join(this.directory, `${id}.webm`);

          await video.saveAs(path);
          await this.addFile(path, 'video', 'video/webm', id, url);
        });
    if (errors.length) throw new AggregateError(errors, '执行附件归档失败', { cause: errors[0] });
  }
  private async addFile(
    path: string,
    kind: 'video' | 'trace',
    contentType: string,
    pageId: string,
    pageUrl: string,
  ) {
    const capturedAt = new Date().toISOString();

    await chmod(path, 0o600);
    await insertArtifact(
      {
        id: randomUUID(),
        runId: this.run.id,
        kind,
        stage: 'final',
        pageId,
        pageUrl,
        capturedAt,
        elapsedMs: Date.parse(capturedAt) - Date.parse(this.run.startedAt),
        contentType,
        size: (await stat(path)).size,
      },
      path,
    );
  }
}
