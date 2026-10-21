import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));

vi.mock('@testdog/engine/llm/deepseek', () => ({
  deepseekClient: { generate: mocks.generate },
}));
vi.mock('@/server/shared/auth', () => ({ requireUserId: async () => null }));
vi.mock('@testdog/server/db', async () => {
  const result = await (await import('@testdog/server/testing/testDatabase')).createTestDatabase();

  mocks.client = result.client;

  return { db: result.db };
});
import { createRun } from '@testdog/server/runs/submission';
import { getRun, getArtifact } from '@testdog/server/runs/repository';
import { saveTest } from '@testdog/server/test-cases/repository';
import { saveRecordingVersion } from '@testdog/server/runs/recordings';
import { requestCancellation } from '@testdog/server/runs/lifecycle';
import { recordingScript } from '@testdog/contracts/runs/lib/recordingScript';
import { claimRun, registerResources, withLease } from '@testdog/server/scheduling/scheduler';
import { executeRun as executeClaimedRun } from '@testdog/server/execution/executeRun';
import { cancelRun } from '@testdog/server/execution/cancellation';
import { executeTestRun as executeRun } from '@testdog/server/testing/executeTestRun';
import { listBrowserLogs } from '@testdog/server/runs/logs';
import { listModelCalls, readModelCall } from '@testdog/server/runs/modelUsage';
import { RunRecorder } from '@testdog/server/execution/recording/webRecorder';
import { listResources } from '@testdog/server/scheduling/scheduler';
import { GET as serveArtifact } from '../../../../apps/web/src/app/api/runs/[id]/artifacts/[artifactId]/route';

let server: Server;
let url: string;
let directory: string;
let experimentRequests = 0;

async function logs(id: string) {
  return (
    await listBrowserLogs(id, new Request(`http://localhost/api/runs/${id}/logs?kind=all`), null)
  ).logs;
}

function ref(value: unknown, role: string): string | undefined {
  if (!value || typeof value !== 'object') return;
  const node = value as { role?: string; ref?: string };

  if (node.role === role && node.ref) return node.ref;
  for (const child of Object.values(value)) {
    const found = ref(child, role);

    if (found) return found;
  }
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'testdog-recording-'));
  vi.stubEnv('TESTDOG_DATA_DIR', directory);
  vi.stubEnv('AUTOMATION_HEADLESS', 'true');
  server = createServer((request, response) => {
    if (request.url === '/abtest_config') {
      experimentRequests++;
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({
          data: { checkout: { val: 'A', vid: '100' }, untouched: { val: 'original' } },
        }),
      );

      return;
    }

    if (request.url === '/experiment') {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        `<h1 id="group">Loading</h1><script>const r = new XMLHttpRequest(); r.open('POST', '/abtest_config', false); r.send('probe'); document.querySelector('#group').textContent = JSON.parse(r.responseText).data.checkout.val;</script>`,
      );

      return;
    }

    if (request.url === '/api/check') {
      response.setHeader('Authorization', 'secret');
      response.end('ok');

      return;
    }

    if (request.url === '/api/fail') {
      request.socket.destroy();

      return;
    }

    response.setHeader('Content-Type', 'text/html');
    response.end(
      request.url === '/popup'
        ? '<h1>Popup ready</h1><script>console.warn("popup console")</script>'
        : `<h1>Workspace verification</h1><form><label>Name<input data-testid="name" /></label><button data-testid="submit">Continue</button></form><a href="/popup" target="_blank">Open popup</a><script>console.log('browser console');fetch('/api/check');fetch('/api/fail').catch(()=>{});setTimeout(()=>{throw new Error('page exploded')},0);document.querySelector('form').onsubmit=e=>{e.preventDefault();document.querySelector('h1').textContent='Welcome '+document.querySelector('input').value}</script>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}, 30000);
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mocks.client!.close();
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.stubEnv('TESTDOG_WEB_AGENT', 'llm');
  await mocks.client!.exec('TRUNCATE run_artifacts, run_steps, test_runs, test_cases CASCADE');
  mocks.generate.mockReset();
  mocks.generate.mockImplementation(async (input) => {
    if (input.responseFormat?.name === 'plan')
      return {
        structuredContent: {
          rootId: 'root',
          nodes: [
            {
              id: 'task',
              kind: 'task',
              goal: 'Fill name and submit',
              dependsOn: [],
              requirementIds: [],
              assertions: [{ description: 'Welcome Ada is visible' }],
            },
            {
              id: 'open',
              kind: 'task',
              actionType: 'navigate',
              goal: url,
              dependsOn: [],
              requirementIds: [],
              assertions: [],
            },
            {
              id: 'root',
              kind: 'group',
              goal: '页面测试',
              children: ['open', 'task'],
              dependsOn: [],
            },
          ],
        },
      };
    if (input.responseFormat?.name === 'assertion_result')
      return { structuredContent: { passed: true, evidence: 'Welcome Ada heading is visible' } };
    const state = JSON.parse(input.messages[0].content.text);

    if (state.completedSteps.length >= 3) return { content: { text: 'DONE' }, toolCalls: [] };
    if (state.completedSteps.length === 2)
      return {
        content: { text: '' },
        toolCalls: [
          {
            id: 'wait',
            name: 'wait',
            arguments: JSON.stringify({ condition: 'observe', value: '', timeoutMs: 1000 }),
          },
        ],
      };
    const fill = state.completedSteps.length === 0;

    return {
      content: { text: '' },
      toolCalls: [
        {
          id: 'call',
          name: fill ? 'fill' : 'click',
          arguments: JSON.stringify(
            fill
              ? { ref: ref(state.observation.tree, 'textbox'), value: 'Ada' }
              : { ref: ref(state.observation.tree, 'button') },
          ),
        },
      ],
    };
  });
});
describe('recording and replay with real PostgreSQL and Chromium', { timeout: 30000 }, () => {
  it('runs Jev-first actions without a hybrid LLM plan and replays without Jev', async () => {
    vi.stubEnv('TESTDOG_WEB_AGENT', 'hybrid');
    vi.stubEnv('JEV_API_KEY', 'fixture-key');
    vi.stubEnv('JEV_MODEL', 'jev-1.14.0');
    vi.stubEnv('JEV_ENDPOINT', 'https://jev.test/v1/systemone');
    const implementation = mocks.generate.getMockImplementation()!;

    mocks.generate.mockImplementation(async (input) => {
      const result = await implementation(input);

      if (input.responseFormat?.name === 'plan') {
        const task = result.structuredContent.nodes.find(
          (node: { id: string }) => node.id === 'task',
        );

        task.goal = '点击 Continue';
        task.assertions = [];
      }

      return result;
    });
    const choice = vi.spyOn(globalThis, 'fetch').mockImplementation(async (endpoint, request) => {
      expect(endpoint).toBe('https://jev.test/v1/systemone');
      const criteria = JSON.parse(request!.body as string).questions.next.criteria as Record<
        string,
        string
      >;
      const id = criteria.done
        ? 'done'
        : Object.keys(criteria).find(
            (key) =>
              criteria[key].includes('"name":"Continue"') &&
              criteria[key].includes('"type":"click"'),
          );

      expect(id).toBeTruthy();

      return new Response(
        JSON.stringify({
          model: 'jev-1.14.0',
          answers: {
            next: { type: 'choice', choice: id, confidence: 0.99, probabilities: { [id!]: 1 } },
          },
          usage: { input_tokens: 100, output_tokens: 5 },
        }),
      );
    });

    try {
      const run = await createRun({ case: '点击 Continue', url }, undefined, null);

      await executeRun(run);
      const recorded = await getRun(run.id, { userId: null });
      const calls = await listModelCalls(run.id);
      const jev = calls.filter((call) => call.purpose === 'jev_next_action');

      expect(recorded.status, recorded.error).toBe('passed');
      expect(recorded.replayable).toBe(true);
      expect(jev).toHaveLength(2);
      expect((await readModelCall(run.id, jev[0].id)).steps).toEqual([
        expect.objectContaining({ kind: 'action', status: 'passed' }),
      ]);
      expect(choice).toHaveBeenCalledTimes(2);

      vi.stubEnv('JEV_API_KEY', '');
      const replay = await createRun({ mode: 'replay', sourceRunId: run.id }, undefined, null);

      await executeRun(replay);
      expect((await getRun(replay.id, { userId: null })).status).toBe('passed');
      expect(choice).toHaveBeenCalledTimes(2);
    } finally {
      choice.mockRestore();
    }
  });

  it('fails a replay without recorded actions before compiling or opening the browser', async () => {
    const run = await createRun({ case: 'Missing recording', url }, undefined, null);

    await mocks.client!.query('UPDATE test_runs SET mode = $1 WHERE id = $2', ['replay', run.id]);
    await executeRun(await getRun(run.id, { userId: null }));
    const result = await getRun(run.id, { userId: null });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('录制缺少操作快照');
    expect(result.artifacts).toHaveLength(0);
    expect(result.steps).toHaveLength(0);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('compiles text with target context before execution', async () => {
    const implementation = mocks.generate.getMockImplementation()!;

    mocks.generate.mockImplementation(async (input) => {
      const result = await implementation(input);

      if (input.responseFormat?.name === 'plan') {
        const task = result.structuredContent.nodes[0];

        task.goal = 'Fill Ada and submit';
        task.assertions = [{ description: 'Welcome Ada is visible' }];
      }

      return result;
    });
    const run = await createRun(
      {
        case: 'Fill Ada and submit',
        target: {
          schemaVersion: 1,
          platform: 'web',
          url,
          browser: 'chromium',
          deviceProfile: 'Pixel 7',
        },
      },
      undefined,
      null,
    );

    await executeRun(run);
    const recorded = await getRun(run.id, { userId: null });

    expect(recorded.status, recorded.error).toBe('passed');
    expect(recorded.plan?.nodes.task).toMatchObject({
      goal: 'Fill Ada and submit',
      assertions: [{ description: 'Welcome Ada is visible' }],
    });
    const compile = mocks.generate.mock.calls.find(
      ([input]) => input.responseFormat?.name === 'plan',
    )!;

    expect(JSON.parse(compile[0].messages[0].content.text)).toMatchObject({
      goal: 'Fill Ada and submit',
      url,
      context: { platform: 'web' },
    });
    expect(recorded.plan?.nodes.open).toMatchObject({
      actionType: 'navigate',
      goal: url,
    });
  });
  it('executes an authored tree without compiling its text again', async () => {
    const saved = await saveTest(
      {
        name: 'Board case',
        goal: 'Original text',
        tags: [],
        target: {
          schemaVersion: 1,
          platform: 'web',
          browser: 'chromium',
          deviceProfile: 'Pixel 7',
        },
        plan: {
          rootId: 'root',
          nodes: {
            root: {
              id: 'root',
              kind: 'group',
              goal: 'Board case',
              children: ['open', 'authored'],
              dependsOn: [],
            },
            open: {
              id: 'open',
              kind: 'task',
              actionType: 'navigate',
              goal: url,
              dependsOn: [],
              requirementIds: [],
              assertions: [],
            },
            authored: {
              id: 'authored',
              kind: 'task',
              goal: 'Fill Ada and submit',
              dependsOn: [],
              requirementIds: [],
              assertions: [{ description: 'Welcome Ada is visible' }],
            },
          },
        },
      },
      undefined,
      null,
    );
    const run = await createRun({ testId: saved.id }, undefined, null);

    await executeRun(run);
    const recorded = await getRun(run.id, { userId: null });

    expect(recorded.status, recorded.error).toBe('passed');
    expect(recorded.steps.filter((step) => step.kind === 'navigate')).toHaveLength(1);
    expect(recorded.steps[0].planNodeId).toBe('open');
    expect(recorded.plan?.nodes.authored).toMatchObject({
      goal: 'Fill Ada and submit',
      assertions: [{ description: 'Welcome Ada is visible' }],
    });
    expect(mocks.generate.mock.calls.some(([input]) => input.responseFormat?.name === 'plan')).toBe(
      false,
    );
    expect(
      recorded.steps
        .filter((step) => step.kind !== 'navigate')
        .every((step) => step.planNodeId === 'authored'),
    ).toBe(true);
  });

  it('persists real experiment overrides and replays them through the recorder without a model', async () => {
    experimentRequests = 0;
    const experimentUrl = `${url}/experiment`;
    const run = await createRun(
      {
        draft: {
          name: 'Experiment override',
          goal: 'Use checkout group B',
          target: { platform: 'web', url: experimentUrl },
          plan: {
            rootId: 'root',
            nodes: {
              root: {
                id: 'root',
                kind: 'group',
                goal: 'Experiment',
                children: ['override', 'open'],
                dependsOn: [],
              },
              override: {
                id: 'override',
                kind: 'task',
                actionType: 'plugin',
                goal: 'Checkout group B',
                dependsOn: [],
                requirementIds: [],
                assertions: [],
                plugin: {
                  id: 'volcengine-abtest',
                  config: {
                    experimentName: 'Checkout',
                    key: 'checkout',
                    value: 'B',
                    variantId: '200',
                    urlIncludes: '/abtest_config',
                  },
                },
              },
              open: {
                id: 'open',
                kind: 'task',
                actionType: 'navigate',
                goal: experimentUrl,
                dependsOn: [],
                requirementIds: [],
                assertions: [],
              },
            },
          },
        },
      },
      undefined,
      null,
    );

    await executeRun(run);
    const recorded = await getRun(run.id, { userId: null });

    expect(recorded.status, recorded.error).toBe('passed');
    expect(recorded.replayable).toBe(true);
    const pluginStep = recorded.steps.find((step) => step.planNodeId === 'override')!;

    expect(pluginStep.action?.action.type).toBe('plugin');
    expect(JSON.parse(pluginStep.evidence!)).toMatchObject({
      key: 'checkout',
      before: { val: 'A', vid: '100' },
      after: { val: 'B', vid: '200' },
      hits: 1,
    });
    expect(recorded.artifacts.some((artifact) => artifact.kind === 'screenshot')).toBe(true);
    const replay = await createRun({ mode: 'replay', sourceRunId: recorded.id }, undefined, null);

    await executeRun(replay);
    const replayed = await getRun(replay.id, { userId: null });

    expect(replayed.status, replayed.error).toBe('passed');
    expect(
      JSON.parse(replayed.steps.find((step) => step.planNodeId === 'override')!.evidence!),
    ).toMatchObject({ after: { val: 'B' } });
    expect(experimentRequests).toBe(2);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('records each action, screenshots, video and trace, then replays without calling the planner', async () => {
    const run = await createRun(
      { case: 'Enter Ada, submit and verify welcome', url },
      undefined,
      null,
    );

    await executeRun(run);
    const recorded = await getRun(run.id, { userId: null });

    expect(recorded.status, recorded.error).toBe('passed');
    expect(await logs(recorded.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'console', message: 'browser console', pageId: 'page-1' }),
        expect.objectContaining({
          kind: 'console',
          level: 'error',
          message: expect.stringContaining('page exploded'),
        }),
        expect.objectContaining({
          kind: 'network',
          url: `${url}/api/check`,
          status: 200,
          responseHeaders: expect.objectContaining({ authorization: '[redacted]' }),
        }),
        expect.objectContaining({
          kind: 'network',
          url: `${url}/api/fail`,
          failure: expect.any(String),
        }),
      ]),
    );
    expect(recorded.replayable).toBe(true);
    expect(recorded.steps.map((step) => step.kind)).toEqual([
      'navigate',
      'action',
      'action',
      'wait',
      'assertion',
    ]);
    expect(recorded.steps[1].action?.action).toMatchObject({
      type: 'fill',
      target: { kind: 'css', value: 'internal:testid=[data-testid="name"s]' },
      value: 'Ada',
    });
    expect(recorded.steps.every((step) => step.status === 'passed')).toBe(true);
    const calls = await listModelCalls(run.id);

    expect(calls).toHaveLength(6);
    expect(calls.every((call) => call.hasTrace)).toBe(true);
    expect(calls.every((call) => !('trace' in call))).toBe(true);
    const fillStep = recorded.steps[1];
    const fillCall = await readModelCall(run.id, fillStep.modelCallId!);

    expect(fillCall.trace?.tools).toEqual([
      expect.objectContaining({
        id: fillStep.toolCallId,
        name: 'fill',
        arguments: expect.stringContaining('Ada'),
      }),
    ]);
    expect(fillCall.steps).toEqual([
      expect.objectContaining({
        id: fillStep.id,
        status: 'passed',
        toolCallId: fillStep.toolCallId,
      }),
    ]);
    expect(
      (await readModelCall(run.id, recorded.steps.at(-1)!.modelCallId!)).trace?.reply,
    ).toContain('Welcome Ada');
    expect(
      recorded.artifacts.filter((item) => item.kind === 'screenshot').length,
    ).toBeGreaterThanOrEqual(11);
    // Live frames are skipped while step evidence is captured/persisted.
    // Dedicated recorder tests verify idle live capture; action evidence is mandatory here.
    expect(recorded.artifacts.some((item) => item.kind === 'video')).toBe(true);
    expect(recorded.artifacts.some((item) => item.kind === 'trace')).toBe(true);
    const video = await getArtifact(
      run.id,
      recorded.artifacts.find((item) => item.kind === 'video')!.id,
      null,
    );

    expect((await readFile(video.path)).subarray(0, 4).toString('hex')).toBe('1a45dfa3');
    const served = await serveArtifact(
      new Request('http://localhost/video', { headers: { Range: 'bytes=0-3' } }),
      { params: Promise.resolve({ id: run.id, artifactId: video.id }) },
    );

    expect(served.status).toBe(206);
    expect(served.headers.get('content-type')).toBe('video/webm');
    expect(Buffer.from(await served.arrayBuffer()).toString('hex')).toBe('1a45dfa3');
    const assertion = mocks.generate.mock.calls.find(
      ([input]) => input.responseFormat?.name === 'assertion_result',
    );

    expect(assertion![0].messages[0].content.text).toContain('Welcome Ada');
    mocks.generate.mockClear();
    const replay = await createRun({ mode: 'replay', sourceRunId: run.id }, undefined, null);

    await executeRun(replay);
    const result = await getRun(replay.id, { userId: null });

    expect(await logs(result.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'console', message: 'browser console' }),
        expect.objectContaining({ kind: 'network', status: 200 }),
      ]),
    );
    expect(result.status, result.error).toBe('passed');
    expect(result.sourceRunId).toBe(run.id);
    expect(result.steps).toHaveLength(5);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0][0].responseFormat.name).toBe('assertion_result');
    expect(mocks.generate.mock.calls[0][0].messages[0].content.text).toContain('Welcome Ada');
    const detached = await createRun({ mode: 'replay', sourceRunId: run.id }, undefined, null);

    await mocks.client!.query('DELETE FROM test_runs WHERE id = $1', [run.id]);
    mocks.generate.mockClear();
    await executeRun(await getRun(detached.id, { userId: null }));
    const detachedResult = await getRun(detached.id, { userId: null });

    expect(detachedResult.status, detachedResult.error).toBe('passed');
    expect(detachedResult.sourceRunId).toBeUndefined();
    expect(detachedResult.steps).toHaveLength(5);
    expect(detachedResult.replayEnvironmentSnapshot).toEqual(recorded.environmentSnapshot);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0][0].responseFormat.name).toBe('assertion_result');
  }, 30000);
  it('preserves failed assertion evidence and its after screenshot', async () => {
    const implementation = mocks.generate.getMockImplementation()!;

    mocks.generate.mockImplementation(async (input) =>
      input.responseFormat?.name === 'assertion_result'
        ? { structuredContent: { passed: false, evidence: 'Expected welcome message is missing' } }
        : implementation(input),
    );
    const run = await createRun({ case: 'Verify welcome', url }, undefined, null);

    await executeRun(run);
    const saved = await getRun(run.id, { userId: null });

    expect(saved.status).toBe('failed');
    expect(saved.error).toContain('Expected welcome message is missing');
    const failed = saved.steps.find((step) => step.status === 'failed')!;

    expect(failed.kind).toBe('assertion');
    const assertionCall = await readModelCall(run.id, failed.modelCallId!);

    expect(assertionCall.trace?.reply).toContain('Expected welcome message is missing');
    expect(assertionCall.steps).toEqual([
      expect.objectContaining({
        id: failed.id,
        status: 'failed',
        error: expect.stringContaining('Expected welcome message is missing'),
      }),
    ]);
    expect(
      saved.artifacts.some((item) => item.stepId === failed.id && item.stage === 'after'),
    ).toBe(true);
    expect(saved.replayable).toBe(false);
    expect((await logs(saved.id)).some((log) => log.kind === 'network')).toBe(true);
  }, 30000);
  it('records and replays a popup with the correct page and per-page videos', async () => {
    mocks.generate.mockImplementation(async (input) => {
      if (input.responseFormat?.name === 'plan')
        return {
          structuredContent: {
            rootId: 'root',
            nodes: [
              {
                id: 'popup',
                kind: 'task',
                goal: 'Open popup',
                dependsOn: [],
                requirementIds: [],
                assertions: [{ description: 'Popup ready is visible' }],
              },
              {
                id: 'open',
                kind: 'task',
                actionType: 'navigate',
                goal: url,
                dependsOn: [],
                requirementIds: [],
                assertions: [],
              },
              {
                id: 'root',
                kind: 'group',
                goal: '弹窗测试',
                children: ['open', 'popup'],
                dependsOn: [],
              },
            ],
          },
        };
      if (input.responseFormat?.name === 'assertion_result')
        return {
          structuredContent: {
            passed: JSON.stringify(JSON.parse(input.messages[0].content.text).observation).includes(
              'Popup ready',
            ),
            evidence: 'Popup ready must be visible in the active page observation',
          },
        };
      const state = JSON.parse(input.messages[0].content.text);

      if (state.completedSteps.length > 0) {
        if (
          state.completedSteps.some((step: { type: string }) => step.type === 'wait') &&
          JSON.stringify(state.observation).includes('Popup ready')
        )
          return { content: { text: 'DONE' }, toolCalls: [] };

        return {
          content: { text: '' },
          toolCalls: [
            {
              id: 'popup-wait',
              name: 'wait',
              arguments: JSON.stringify({ condition: 'newPage', value: '', timeoutMs: 5000 }),
            },
          ],
        };
      }

      return {
        content: { text: '' },
        toolCalls: [
          {
            id: 'popup-click',
            name: 'click',
            arguments: JSON.stringify({ ref: ref(state.observation.tree, 'link') }),
          },
        ],
      };
    });
    const run = await createRun({ case: 'Open popup and verify', url }, undefined, null);

    await executeRun(run);
    const record = await getRun(run.id, { userId: null });

    expect(record.status, record.error).toBe('passed');
    expect(record.steps.at(-1)?.pageId).toBe('page-2');
    expect(record.artifacts.filter((item) => item.kind === 'video')).toHaveLength(2);
    expect(
      mocks.generate.mock.calls.find(
        ([input]) => input.responseFormat?.name === 'assertion_result',
      )![0].messages[0].content.text,
    ).toContain('Popup ready');
    const replay = await createRun({ mode: 'replay', sourceRunId: record.id }, undefined, null);

    await executeRun(replay);
    const result = await getRun(replay.id, { userId: null });

    expect(result.status, result.error).toBe('passed');
    expect(result.steps.at(-1)?.pageId).toBe('page-2');
    expect(await logs(result.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'console',
          level: 'warning',
          message: 'popup console',
          pageId: 'page-2',
        }),
      ]),
    );
    const wait = result.steps.find((step) => step.kind === 'wait');

    expect(wait).toBeDefined();
    expect(wait!.durationMs).toBeLessThan(2000);
    expect(result.steps.at(-1)?.evidence).toContain('Popup ready');
  }, 30000);

  it('fails incomplete evidence but releases the closed browser slot for the next run', async () => {
    const original = RunRecorder.prototype.stop;
    const archive = vi.spyOn(RunRecorder.prototype, 'stop').mockImplementationOnce(async function (
      this: RunRecorder,
      ...args
    ) {
      await original.apply(this, args);
      throw new Error('evidence export failed');
    });

    try {
      const run = await createRun({ case: 'Archive failure', url }, undefined, null);

      await executeRun(run);
      const result = await getRun(run.id, { userId: null });

      expect(result.status).toBe('failed');
      expect(result.evidenceComplete).toBe(false);
      expect(result.replayable).toBe(false);
      expect(result.error).toContain('evidence export failed');
      expect(
        (await listResources()).find((resource) => resource.id === result.resourceId)?.status,
      ).toBe('available');
      const next = await createRun({ case: 'Next browser run', url }, undefined, null);

      await executeRun(next);
      expect((await getRun(next.id, { userId: null })).status).toBe('passed');
    } finally {
      archive.mockRestore();
    }
  }, 30000);

  it('closes an active browser on cancellation and archives its existing video', async () => {
    const original = mocks.generate.getMockImplementation()!;

    mocks.generate.mockImplementation((input) =>
      input.tools
        ? new Promise((_resolve, reject) =>
            input.signal.addEventListener('abort', () => reject(input.signal.reason), {
              once: true,
            }),
          )
        : original(input),
    );
    const run = await createRun({ case: 'Cancel active browser', url }, undefined, null);
    const job = executeRun(run);

    try {
      await vi.waitFor(
        () => expect(mocks.generate.mock.calls.some(([input]) => input.tools)).toBe(true),
        { timeout: 15000 },
      );
    } catch (error) {
      cancelRun(run.id);
      await job.catch(() => {});
      throw error;
    }

    await requestCancellation(run.id, null);
    cancelRun(run.id);
    await job;
    const result = await getRun(run.id, { userId: null });

    expect(result.status).toBe('cancelled');
    expect(result.errorCode).toBe('CANCELLED');
    expect(await logs(result.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'console', message: 'browser console' }),
      ]),
    );
    expect(result.artifacts.some((item) => item.kind === 'video')).toBe(true);
  });

  it('honors cancellation arriving during finalization in the terminal transaction', async () => {
    const run = await createRun({ case: 'Cancel during finalization', url }, undefined, null);
    const original = RunRecorder.prototype.stop;
    const archive = vi.spyOn(RunRecorder.prototype, 'stop').mockImplementation(async function (
      this: RunRecorder,
      ...args
    ) {
      await requestCancellation(run.id, null);
      await original.apply(this, args);
    });

    try {
      await executeRun(run);
      const result = await getRun(run.id, { userId: null });

      expect(result.status).toBe('cancelled');
      expect(result.errorCode).toBe('CANCELLED');
      expect(result.cancelRequested).toBe(true);
      expect(result.replayable).toBe(false);
      expect(result.steps.every((step) => step.status === 'passed')).toBe(true);
    } finally {
      archive.mockRestore();
    }
  });

  it('retains the primary failure and an additional archive error', async () => {
    const original = RunRecorder.prototype.stop;
    const archive = vi.spyOn(RunRecorder.prototype, 'stop').mockImplementation(async function (
      this: RunRecorder,
      ...args
    ) {
      await original.apply(this, args);
      throw new Error('archive failed: disk unavailable');
    });
    const implementation = mocks.generate.getMockImplementation()!;

    mocks.generate.mockImplementation(async (input) =>
      input.responseFormat?.name === 'assertion_result'
        ? { structuredContent: { passed: false, evidence: 'primary assertion failed' } }
        : implementation(input),
    );
    try {
      const run = await createRun(
        {
          case: 'Fail with archive error',
          target: {
            schemaVersion: 1,
            platform: 'web',
            url,
            browser: 'chromium',
            deviceProfile: 'Pixel 7',
          },
        },
        undefined,
        null,
      );

      await executeRun(run);
      const result = await getRun(run.id, { userId: null });

      expect(result).toMatchObject({
        status: 'failed',
        errorCode: 'EXECUTION_FAILED',
        evidenceComplete: false,
      });
      expect(result.error).toContain('primary assertion failed');
      expect(result.error).toContain('archive failed: disk unavailable');
    } finally {
      archive.mockRestore();
    }
  });

  it('requires a matching lease without registering resources or claiming the run', async () => {
    const run = await createRun({ case: 'Requires a lease', url }, undefined, null);
    const resources = await listResources();

    await expect(executeClaimedRun(run)).rejects.toThrow('执行租约');
    await expect(
      withLease({ runId: 'another-run', workerId: 'test-worker', fencingToken: 1 }, () =>
        executeClaimedRun(run),
      ),
    ).rejects.toThrow('执行租约');
    const current = await getRun(run.id, { userId: null });

    expect(current.status).toBe('queued');
    expect(current.workerId).toBeUndefined();
    expect(current.events).toEqual([]);
    expect(current.steps).toEqual([]);
    expect(await listResources()).toEqual(resources);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('stops before model or browser work when another worker owns the execution', async () => {
    const run = await createRun({ case: 'Ownership changed', url }, undefined, null);

    await registerResources([
      { id: 'replacement-web', hostId: 'replacement-host', platform: 'web', profileId: 'mobile' },
    ]);
    const claim = await claimRun('replacement-worker', 'replacement-host', run.id);

    expect(claim).toBeDefined();
    await expect(executeClaimedRun(run)).rejects.toThrow('执行租约');
    const current = await getRun(run.id, { userId: null });

    expect(current.status).toBe('preparing');
    expect(current.cancelRequested).toBe(false);
    expect(current.artifacts).toEqual([]);
    expect(current.steps).toEqual([]);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('stops an in-flight model request and persists a cancelled run', async () => {
    mocks.generate.mockImplementation(
      (input) =>
        new Promise((_resolve, reject) => {
          input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true });
        }),
    );
    const run = await createRun({ case: 'Wait for model', url }, undefined, null);
    const job = executeRun(run);

    await vi.waitFor(() => expect(mocks.generate).toHaveBeenCalled());
    await requestCancellation(run.id, null);
    cancelRun(run.id);
    await job;
    expect((await getRun(run.id, { userId: null })).status).toBe('cancelled');
  });
});

it('executes edited input and real Playwright expectations without planning, and records assertion failure', async () => {
  const original = await createRun({ case: 'Enter Ada and welcome', url }, undefined, null);

  await executeRun(original);
  const saved = await getRun(original.id, { userId: null });

  expect(saved.steps[1].planNodeId).toBe('task');
  const script = recordingScript(saved.steps).replaceAll('Ada', 'Grace');
  const actions = script.slice(0, script.indexOf('// Welcome Grace'));
  const version = await saveRecordingVersion(
    original.id,
    actions +
      '\n// @node task\nawait expect(page1.getByRole("heading")).toHaveText("Welcome Grace");\nawait expect(page1.getByTestId("name")).toHaveValue("Grace");',
    null,
  );

  mocks.generate.mockClear();
  const edited = await createRun(
    {
      mode: 'replay',
      sourceRunId: original.id,
      recordingVersionId: version.id,
    },
    undefined,
    null,
  );

  await executeRun(edited);
  const result = await getRun(edited.id, { userId: null });

  expect(result.status, result.error).toBe('passed');
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(result.steps[1].action).toMatchObject({ platform: 'web', action: { value: 'Grace' } });
  expect(result.steps.at(-2)?.platformAssertion?.value).toBe('Welcome Grace');
  expect(result.steps.at(-2)?.planNodeId).toBe('task');
  expect((await getRun(original.id, { userId: null })).steps[1].action).toMatchObject({
    platform: 'web',
    action: { value: 'Ada' },
  });
  const incorrect = await saveRecordingVersion(
    original.id,
    version.code.replace('toHaveText("Welcome Grace")', 'toHaveText("Welcome Ada")'),
    null,
  );
  const failing = await createRun(
    {
      mode: 'replay',
      sourceRunId: original.id,
      recordingVersionId: incorrect.id,
    },
    undefined,
    null,
  );

  await executeRun(failing);
  const failure = await getRun(failing.id, { userId: null });

  expect(failure.status).toBe('failed');
  expect(failure.error).toContain('Welcome Ada');
  const step = failure.steps.find((s) => s.status === 'failed')!;

  expect(step.platformAssertion?.type).toBe('text');
  expect(failure.artifacts.some((a) => a.stepId === step.id && a.stage === 'after')).toBe(true);
}, 30000);
