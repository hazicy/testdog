import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import type { ExecutionStep, RunArtifact, StepSignal, TestRun } from './types';
import { insertArtifact, insertStep, finishStep } from './store';
import { BrowserLogs } from './browserLogs';
import { recordAction } from './locator';
export const artifactRoot = () =>
  join(process.env.CASEFORGE_DATA_DIR || join(process.cwd(), '.automation'), 'artifacts');
export class RunRecorder {
  private page?: Page;
  private logs: BrowserLogs;
  private activeSteps = new Map<Page, string>();
  private pages = new Map<Page, string>();
  private steps = new Map<string, ExecutionStep>();
  private sequence = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  private captureError?: unknown;
  private livePending = false;
  readonly directory: string;
  constructor(private run: TestRun) {
    this.logs = new BrowserLogs(run.id, run.startedAt, (page) => ({
      pageId: this.pageId(page),
      stepId: this.activeSteps.get(page),
    }));
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
  async start(context: BrowserContext) {
    await mkdir(this.directory, { recursive: true });
    this.logs.start(context);
    context.pages().forEach(this.pageId);
    context.on('page', this.onPage);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    this.timer = setInterval(() => {
      if (this.page && !this.page.isClosed() && !this.livePending) {
        this.livePending = true;
        void this.capture(this.page, 'live')
          .catch((error) => {
            this.captureError = error;
          })
          .finally(() => {
            this.livePending = false;
          });
      }
    }, 1000);
  }
  onStep = async (event: StepSignal, page: Page) => {
    if (this.captureError) throw this.captureError;
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
    const operation = this.queue.then(async () => {
      if (page.isClosed()) return;
      const id = randomUUID();
      const capturedAt = new Date().toISOString();
      let bytes: Buffer;
      try {
        bytes = await page.screenshot({ type: 'jpeg', quality: 72, timeout: 3000 });
      } catch (error) {
        if (page.isClosed() || /Target.*closed|navigation|Execution context/.test(String(error)))
          return;
        throw error;
      }
      const path = join(this.directory, `${id}.jpg`);
      await writeFile(path, bytes, { mode: 0o600 });
      await insertArtifact(
        {
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
        },
        path,
      );
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async stop(context: BrowserContext, interrupted = false) {
    try {
      await this.stopArtifacts(context, interrupted);
    } finally {
      await this.logs.stop(context);
    }
  }
  private async stopArtifacts(context: BrowserContext, interrupted: boolean) {
    if (this.timer) clearInterval(this.timer);
    await this.queue;
    if (!interrupted && this.page && !this.page.isClosed()) await this.capture(this.page, 'final');
    const trace = join(this.directory, 'trace.zip');
    if (!interrupted) {
      await context.tracing.stop({ path: trace });
      await this.addFile(
        trace,
        'trace',
        'application/zip',
        this.page ? this.pageId(this.page) : 'page-1',
        this.page?.url() || '',
      );
    }
    const videos = [...this.pages].map(([page, id]) => ({
      video: page.video(),
      id,
      url: page.url(),
    }));
    context.off('page', this.onPage);
    await context.close().catch(() => {});
    for (const { video, id, url } of videos)
      if (video) await this.addFile(await video.path(), 'video', 'video/webm', id, url);
  }
  private async addFile(
    path: string,
    kind: 'video' | 'trace',
    contentType: string,
    pageId: string,
    pageUrl: string,
  ) {
    const capturedAt = new Date().toISOString();
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
