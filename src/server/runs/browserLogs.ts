import { SecretInputs } from '@/automation/platform/inputs';
import { randomUUID } from 'node:crypto';
import type { BrowserContext, Request } from 'playwright';
import type { BrowserLog } from '@/features/runs/types';
import { appendBrowserLogs } from './repository';

const headers = (values: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      /authorization|cookie|token|api-key/i.test(key) ? '[redacted]' : value.slice(0, 4096),
    ]),
  );
export class BrowserLogs {
  private pending: BrowserLog[] = [];
  private count = 0;
  private requests = new Map<Request, BrowserLog>();
  private inFlight?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private runId: string,
    private startedAt: string,
    private pageInfo: (page: import('playwright').Page) => { pageId: string; stepId?: string },
    private secrets = new SecretInputs(),
  ) {}
  private base(
    page?: import('playwright').Page,
  ): Pick<BrowserLog, 'id' | 'at' | 'elapsedMs' | 'pageId' | 'pageUrl' | 'stepId'> {
    const at = new Date().toISOString();

    return {
      id: randomUUID(),
      at,
      elapsedMs: Math.max(0, Date.parse(at) - Date.parse(this.startedAt)),
      pageUrl: page?.url() || '',
      ...(page ? this.pageInfo(page) : { pageId: 'service-worker' }),
    };
  }
  private add(log: BrowserLog) {
    this.pending.push(this.secrets.redactData(log));
  }
  private reserve() {
    return this.count++ < 2000;
  }
  start(context: BrowserContext) {
    // Context events also include popups and child frames.
    context.on('console', this.onConsole);
    context.on('weberror', this.onError);
    context.on('request', this.onRequest);
    context.on('response', this.onResponse);
    context.on('requestfinished', this.onFinished);
    context.on('requestfailed', this.onFailed);
    this.timer = setInterval(() => {
      void this.flush().catch(() => {});
    }, 500);
  }
  private onConsole = (message: import('playwright').ConsoleMessage) => {
    if (this.reserve())
      this.add({
        ...this.base(message.page() || undefined),
        kind: 'console',
        level: message.type(),
        message: message.text().slice(0, 16000),
      });
  };
  private onError = (error: import('playwright').WebError) => {
    if (this.reserve())
      this.add({
        ...this.base(error.page() || undefined),
        kind: 'console',
        level: 'error',
        message: (error.error().stack || error.error().message).slice(0, 16000),
      });
  };
  private onRequest = (request: Request) => {
    if (!this.reserve()) return;
    let page;
    try {
      page = request.frame().page();
    } catch {
      /* Service worker requests have no frame. */
    }
    const log: BrowserLog = {
      ...this.base(page),
      kind: 'network',
      url: request.url().slice(0, 16000),
      method: request.method(),
      resourceType: request.resourceType(),
      requestHeaders: headers(request.headers()),
    };

    this.requests.set(request, log);
  };
  private onResponse = (response: import('playwright').Response) => {
    const log = this.requests.get(response.request());
    if (log) {
      log.status = response.status();
      log.responseHeaders = headers(response.headers());
    }
  };
  private complete(request: Request, failure?: string) {
    const log = this.requests.get(request);
    if (!log) return;
    log.durationMs = Math.max(0, Date.now() - Date.parse(log.at));
    log.failure = failure;
    this.add(log);
    this.requests.delete(request);
  }
  private onFinished = (request: Request) => this.complete(request);
  private onFailed = (request: Request) =>
    this.complete(request, request.failure()?.errorText || '请求失败');
  flush() {
    if (this.inFlight) return this.inFlight;
    if (!this.pending.length) return Promise.resolve();
    const batch = this.pending.splice(0);
    const operation = (async () => {
      try {
        await appendBrowserLogs(this.runId, batch);
      } catch (error) {
        this.pending.unshift(...batch);
        throw error;
      }
    })();

    this.inFlight = operation;
    void operation
      .finally(() => {
        this.inFlight = undefined;
      })
      .catch(() => {});

    return operation;
  }
  async stop(context: BrowserContext) {
    clearInterval(this.timer);
    context.off('console', this.onConsole);
    context.off('weberror', this.onError);
    context.off('request', this.onRequest);
    context.off('response', this.onResponse);
    context.off('requestfinished', this.onFinished);
    context.off('requestfailed', this.onFailed);
    for (const request of this.requests.keys()) this.complete(request, '执行结束时请求未完成');
    // In-flight batches may fail and be requeued; drain once producers have stopped.
    await this.inFlight?.catch(() => {});
    await this.flush();
  }
}
