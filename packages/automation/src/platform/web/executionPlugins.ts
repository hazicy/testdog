import type { BrowserContext, Route } from 'playwright';
import type { PluginInvocation } from '@testdog/contracts/plugins/execution';
import { experimentOverride } from '@testdog/automation/plugins/responseOverride';

type Rule = ReturnType<typeof experimentOverride> & {
  hits: number;
  report: (evidence: string, error?: string) => Promise<void>;
};

/** One context-owned handler composes all active overrides over one upstream response. */
export class WebExecutionPlugins {
  private active = new Map<string, Rule>();
  private rules: Rule[] = [];
  private pending = new Set<Promise<void>>();
  private failure?: Error;
  private installed = false;

  constructor(private context: BrowserContext) {}

  private handler = (route: Route) => {
    const operation = this.handle(route);

    this.pending.add(operation);
    void operation.finally(() => this.pending.delete(operation));

    return operation;
  };

  async install(invocation: PluginInvocation, report: Rule['report']) {
    this.assertHealthy();
    const rule: Rule = { ...experimentOverride(invocation), hits: 0, report };

    if (!this.installed) {
      await this.context.route('**/*', this.handler);
      this.installed = true;
    }

    this.active.set(rule.identity, rule);
    this.rules.push(rule);

    return { evidence: `已安装实验配置覆盖：${rule.experimentName} · ${rule.key}；等待匹配请求` };
  }

  private async handle(route: Route) {
    const request = route.request();
    const rules =
      request.method() === 'OPTIONS'
        ? []
        : [...this.active.values()].filter((rule) => request.url().includes(rule.urlIncludes));

    if (!rules.length) {
      await route.fallback().catch(() => {});

      return;
    }

    let response: Awaited<ReturnType<Route['fetch']>> | undefined;

    try {
      response = await route.fetch({ timeout: 15000, maxRedirects: 0 });
      if (!response.ok()) throw new Error(`实验接口返回 HTTP ${response.status()}`);
      const body: unknown = await response.json();
      const results = rules.map((rule) => ({ rule, result: rule.apply(body) }));
      const headers = { ...response.headers() };

      delete headers['content-length'];
      delete headers['content-encoding'];
      await route.fulfill({ response, headers, json: body });
      for (const { rule, result } of results) {
        rule.hits++;
        await rule.report(JSON.stringify({ ...result, url: request.url(), hits: rule.hits }));
      }
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));

      this.failure ??= error;
      for (const rule of rules) {
        await rule.report('', `实验配置覆盖失败：${error.message}`).catch(() => {});
      }

      await route.abort('failed').catch(() => {});
    } finally {
      await response?.dispose().catch(() => {});
    }
  }

  assertHealthy() {
    if (this.failure) throw this.failure;
  }

  async verify(signal: AbortSignal) {
    signal.throwIfAborted();
    while (this.pending.size) await Promise.all([...this.pending]);
    this.assertHealthy();
    for (const rule of this.rules) {
      if (rule.hits) continue;
      const error = `未拦截到实验请求：${rule.experimentName} · ${rule.key}`;

      await rule.report('', error);
      throw new Error(error);
    }
  }

  async close() {
    if (this.installed) {
      await this.context.unroute('**/*', this.handler);
      while (this.pending.size) await Promise.all([...this.pending]);
      this.installed = false;
      this.active.clear();
    }
  }
}
