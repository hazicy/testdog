import { createServer, type Server } from 'node:http';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { WebExecutionPlugins } from './executionPlugins';
import { PlaywrightSession } from './playwrightSession';
import { PlanRunner } from '@testdog/automation/planRunner';
import { recordingScript, parseRecordingScript } from '@testdog/contracts/runs/lib/recordingScript';
import { normalizeReplaySteps } from '@testdog/contracts/runs/lib/replay';
import type { PluginInvocation } from '@testdog/contracts/plugins/execution';
import type { RecordingOperation, StepSignal } from '@testdog/contracts/runs/types';

let server: Server;
let browser: Browser;
let context: BrowserContext;
let plugins: WebExecutionPlugins;
let origin: string;
let upstreamRequests: { method: string; body: string }[];
const signal = new AbortController().signal;
const invocation = (value: unknown = 'B', key = 'checkout'): PluginInvocation => ({
  id: 'volcengine-abtest',
  config: {
    experimentName: 'Checkout experiment',
    urlIncludes: '/abtest_config',
    key,
    value,
    variantId: 'variant-b',
  },
});

beforeAll(async () => {
  server = createServer(async (request, response) => {
    if (request.url?.startsWith('/abtest_config')) {
      let body = '';

      for await (const chunk of request) body += chunk;
      upstreamRequests.push({ method: request.method!, body });
      response.writeHead(200, { 'Content-Type': 'application/json', 'X-Upstream': 'preserved' });
      response.end(
        JSON.stringify({
          code: 0,
          data: {
            checkout: { val: 'A', vid: 'variant-a', extra: true },
            color: { val: 'red', vid: 'color-a' },
          },
          untouched: 42,
        }),
      );
    } else if (request.url === '/not-json') {
      response.end('not json');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(
        `<h1>Experiment demo</h1><p id="group">loading</p><script>fetch('/abtest_config', {method:'POST',body:JSON.stringify({user:'test'})}).then(r=>r.json()).then(r=>{document.querySelector('#group').textContent=r.data.checkout.val})</script>`,
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') throw new Error('No server address');
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});
beforeEach(async () => {
  upstreamRequests = [];
  context = await browser.newContext({ serviceWorkers: 'block' });
  plugins = new WebExecutionPlugins(context);
});
afterEach(async () => {
  await plugins.close();
  await context.close();
});
afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve, reject) =>
    server?.close((error) => (error ? reject(error) : resolve())),
  );
});

it('forwards the real POST once and composes overrides without changing other fields or headers', async () => {
  const reports = vi.fn<(evidence: string, error?: string) => Promise<void>>(async () => {});

  await plugins.install(invocation(), reports);
  await plugins.install(invocation('blue', 'color'), reports);
  const page = await context.newPage();

  await page.goto(origin);
  await page.locator('#group').filter({ hasText: 'B' }).waitFor();
  expect(upstreamRequests).toEqual([{ method: 'POST', body: '{"user":"test"}' }]);
  const data = await page.evaluate(async () => {
    const response = await fetch('/abtest_config');

    return {
      status: response.status,
      header: response.headers.get('x-upstream'),
      body: await response.json(),
    };
  });

  expect(data).toEqual({
    status: 200,
    header: 'preserved',
    body: {
      code: 0,
      untouched: 42,
      data: {
        checkout: { val: 'B', vid: 'variant-b', extra: true },
        color: { val: 'blue', vid: 'variant-b' },
      },
    },
  });
  await plugins.verify(signal);
  expect(JSON.parse(reports.mock.calls[0][0])).toMatchObject({
    key: 'checkout',
    before: { val: 'A' },
    after: { val: 'B' },
    hits: 1,
  });
});

it('replaces a previous group for the same experiment and removes its own routes on close', async () => {
  const report = vi.fn<(evidence: string, error?: string) => Promise<void>>(async () => {});
  const page = await context.newPage();

  await plugins.install(invocation('B'), report);
  await page.goto(origin);
  await page.locator('#group').filter({ hasText: 'B' }).waitFor();
  await plugins.install(invocation('C'), report);
  await page.reload();
  await page.locator('#group').filter({ hasText: 'C' }).waitFor();
  await plugins.verify(signal);
  await plugins.close();
  await page.reload();
  await page.locator('#group').filter({ hasText: 'A' }).waitFor();
  expect(upstreamRequests).toHaveLength(3);
});

it.each(['missing', 'not-json', 'unmatched'])(
  'fails explicitly for %s rather than reporting a successful override',
  async (failure) => {
    const input = invocation();

    if (failure === 'missing') input.config.key = 'missing';
    if (failure === 'not-json') input.config.urlIncludes = '/not-json';
    const report = vi.fn<(evidence: string, error?: string) => Promise<void>>(async () => {});

    await plugins.install(input, report);
    const page = await context.newPage();

    if (failure !== 'unmatched') {
      await page.goto(origin);
      await page.evaluate(
        async (path) => {
          await fetch(path).catch(() => {});
        },
        failure === 'not-json' ? '/not-json' : '/abtest_config',
      );
    }

    await expect(plugins.verify(signal)).rejects.toThrow();
    expect(report.mock.calls.some(([, error]) => Boolean(error))).toBe(true);
  },
);

it('records and replays the plugin node before navigation with real response verification and no planner call', async () => {
  const events: StepSignal[] = [];
  const page = await context.newPage();
  const session = new PlaywrightSession('experiment-test', page, {
    onStep: async (event) => {
      events.push(event);
    },
  });
  const planner = { plan: vi.fn() };
  const evaluator = {
    evaluate: vi.fn(async () => {
      await page.locator('#group').filter({ hasText: 'B' }).waitFor();

      return { passed: true, evidence: 'Page received group B' };
    }),
  };
  const runner = new PlanRunner({
    session,
    planner,
    evaluator,
    signal,
    plan: {
      rootId: 'root',
      nodes: {
        root: {
          id: 'root',
          kind: 'group',
          goal: 'AB test',
          children: ['plugin', 'navigate', 'assert'],
          dependsOn: [],
        },
        plugin: {
          id: 'plugin',
          kind: 'task',
          actionType: 'plugin',
          plugin: invocation(),
          goal: 'Override checkout',
          dependsOn: [],
          requirementIds: [],
          assertions: [],
        },
        navigate: {
          id: 'navigate',
          kind: 'task',
          actionType: 'navigate',
          goal: origin,
          dependsOn: [],
          requirementIds: [],
          assertions: [],
        },
        assert: {
          id: 'assert',
          kind: 'task',
          actionType: 'assert',
          goal: 'Group B',
          dependsOn: [],
          requirementIds: [],
          assertions: [{ description: 'Group B' }],
        },
      },
    },
  });

  await runner.record();
  expect(planner.plan).not.toHaveBeenCalled();
  expect(
    events.find((event) => event.planNodeId === 'plugin' && event.evidence?.includes('"after"')),
  ).toMatchObject({ phase: 'finish' });
  const steps: RecordingOperation[] = events
    .filter((event) => event.phase === 'start')
    .map((event) => ({ ...event, pageId: 'page-1' }));
  const parsed = parseRecordingScript(recordingScript(steps));

  expect(parsed[0].action).toEqual(steps[0].action);
  await session.close();
  await page.goto('about:blank');
  const replay = new PlaywrightSession('replay-test', page, { onStep: async () => {} });

  await new PlanRunner({
    session: replay,
    planner,
    evaluator,
    signal,
    plan: { rootId: '', nodes: {} },
  }).replay(normalizeReplaySteps(parsed));
  expect(await page.locator('#group').textContent()).toBe('B');
  expect(upstreamRequests).toHaveLength(2);
  await replay.close();
});
