import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));
vi.mock('@/automation/deepseek', () => ({ generateWithOpenAI: mocks.generate }));
vi.mock('@/db', async () => {
  const result = await (await import('./testDatabase')).createTestDatabase();
  mocks.client = result.client;
  return { db: result.db };
});
import { createRun, getRun, getArtifact } from './store';
import { saveRecordingVersion } from './recordings';
import { requestCancellation } from './runLifecycle';
import { recordingScript } from '../recordingScript';
import { claimRun, registerWorker } from './scheduler';
import { executeRun, cancelRun } from './run';
import { GET as serveArtifact } from '@/app/api/runs/[id]/artifacts/[artifactId]/route';
let server: Server;
let url: string;
let directory: string;
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
  directory = await mkdtemp(join(tmpdir(), 'caseforge-recording-'));
  vi.stubEnv('CASEFORGE_DATA_DIR', directory);
  vi.stubEnv('AUTOMATION_HEADLESS', 'true');
  server = createServer((request, response) => {
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
  await mocks.client!.exec('TRUNCATE run_artifacts, run_steps, test_runs, test_cases CASCADE');
  mocks.generate.mockReset();
  mocks.generate.mockImplementation(async (input) => {
    if (input.responseFormat?.name === 'plan')
      return {
        structuredContent: {
          rootId: 'task',
          nodes: [
            {
              id: 'task',
              kind: 'task',
              goal: 'Fill name and submit',
              dependsOn: [],
              requirementIds: [],
              assertions: [{ description: 'Welcome Ada is visible' }],
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
describe('recording and replay with real PostgreSQL and Chromium', () => {
  it('records each action, screenshots, video and trace, then replays without calling the planner', async () => {
    const run = await createRun({ case: 'Enter Ada, submit and verify welcome', url });
    await executeRun(run);
    const recorded = await getRun(run.id);
    expect(recorded.status, recorded.error).toBe('passed');
    expect(recorded.browserLogs).toEqual(
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
    expect(recorded.steps[1].action).toMatchObject({
      type: 'fill',
      target: { kind: 'testId', value: 'name' },
      value: 'Ada',
    });
    expect(recorded.steps.every((step) => step.status === 'passed')).toBe(true);
    expect(
      recorded.artifacts.filter((item) => item.kind === 'screenshot').length,
    ).toBeGreaterThanOrEqual(11);
    expect(recorded.artifacts.some((item) => item.stage === 'live')).toBe(true);
    expect(recorded.artifacts.some((item) => item.kind === 'video')).toBe(true);
    expect(recorded.artifacts.some((item) => item.kind === 'trace')).toBe(true);
    const video = await getArtifact(
      run.id,
      recorded.artifacts.find((item) => item.kind === 'video')!.id,
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
    const replay = await createRun({ mode: 'replay', sourceRunId: run.id });
    await executeRun(replay);
    const result = await getRun(replay.id);
    expect(result.browserLogs).toEqual(
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
  }, 30000);
  it('preserves failed assertion evidence and its after screenshot', async () => {
    const implementation = mocks.generate.getMockImplementation()!;
    mocks.generate.mockImplementation((input) =>
      input.responseFormat?.name === 'assertion_result'
        ? { structuredContent: { passed: false, evidence: 'Expected welcome message is missing' } }
        : implementation(input),
    );
    const run = await createRun({ case: 'Verify welcome', url });
    await executeRun(run);
    const saved = await getRun(run.id);
    expect(saved.status).toBe('failed');
    expect(saved.error).toContain('Expected welcome message is missing');
    const failed = saved.steps.find((step) => step.status === 'failed')!;
    expect(failed.kind).toBe('assertion');
    expect(
      saved.artifacts.some((item) => item.stepId === failed.id && item.stage === 'after'),
    ).toBe(true);
    expect(saved.replayable).toBe(false);
    expect(saved.browserLogs?.some((log) => log.kind === 'network')).toBe(true);
  }, 30000);
  it('records and replays a popup with the correct page and per-page videos', async () => {
    mocks.generate.mockImplementation(async (input) => {
      if (input.responseFormat?.name === 'plan')
        return {
          structuredContent: {
            rootId: 'popup',
            nodes: [
              {
                id: 'popup',
                kind: 'task',
                goal: 'Open popup',
                dependsOn: [],
                requirementIds: [],
                assertions: [{ description: 'Popup ready is visible' }],
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
    const run = await createRun({ case: 'Open popup and verify', url });
    await executeRun(run);
    const record = await getRun(run.id);
    expect(record.status, record.error).toBe('passed');
    expect(record.steps.at(-1)?.pageId).toBe('page-2');
    expect(record.artifacts.filter((item) => item.kind === 'video')).toHaveLength(2);
    expect(
      mocks.generate.mock.calls.find(
        ([input]) => input.responseFormat?.name === 'assertion_result',
      )![0].messages[0].content.text,
    ).toContain('Popup ready');
    const replay = await createRun({ mode: 'replay', sourceRunId: record.id });
    await executeRun(replay);
    const result = await getRun(replay.id);
    expect(result.status, result.error).toBe('passed');
    expect(result.steps.at(-1)?.pageId).toBe('page-2');
    expect(result.browserLogs).toEqual(
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
    const run = await createRun({ case: 'Cancel active browser', url });
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
    await requestCancellation(run.id);
    cancelRun(run.id);
    await job;
    const result = await getRun(run.id);
    expect(result.status).toBe('cancelled');
    expect(result.browserLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'console', message: 'browser console' }),
      ]),
    );
    expect(result.artifacts.some((item) => item.kind === 'video')).toBe(true);
  });

  it('stops before model or browser work when another worker owns the execution', async () => {
    const run = await createRun({ case: 'Ownership changed', url });
    await registerWorker('replacement-worker', 'replacement-host', [
      { id: 'replacement-web', hostId: 'replacement-host', platform: 'web', profileId: 'mobile' },
    ]);
    const claim = await claimRun('replacement-worker', 'replacement-host', run.id);
    expect(claim).toBeDefined();
    await expect(executeRun(run)).rejects.toThrow();
    const current = await getRun(run.id);
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
    const run = await createRun({ case: 'Wait for model', url });
    const job = executeRun(run);
    await vi.waitFor(() => expect(mocks.generate).toHaveBeenCalled());
    await requestCancellation(run.id);
    cancelRun(run.id);
    await job;
    expect((await getRun(run.id)).status).toBe('cancelled');
  });
});

it('executes edited input and real Playwright expectations without planning, and records assertion failure', async () => {
  const original = await createRun({ case: 'Enter Ada and welcome', url });
  await executeRun(original);
  const saved = await getRun(original.id);
  expect(saved.steps[1].planNodeId).toBe('task');
  const script = recordingScript(saved.steps).replaceAll('Ada', 'Grace');
  const actions = script.slice(0, script.indexOf('// Welcome Grace'));
  const version = await saveRecordingVersion(
    original.id,
    actions +
      '\n// @node task\nawait expect(page1.getByRole("heading")).toHaveText("Welcome Grace");\nawait expect(page1.getByTestId("name")).toHaveValue("Grace");',
  );
  mocks.generate.mockClear();
  const edited = await createRun({
    mode: 'replay',
    sourceRunId: original.id,
    recordingVersionId: version.id,
  });
  await executeRun(edited);
  const result = await getRun(edited.id);
  expect(result.status, result.error).toBe('passed');
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(result.steps[1].action?.value).toBe('Grace');
  expect(result.steps.at(-2)?.playwrightAssertion?.value).toBe('Welcome Grace');
  expect(result.steps.at(-2)?.planNodeId).toBe('task');
  expect((await getRun(original.id)).steps[1].action?.value).toBe('Ada');
  const incorrect = await saveRecordingVersion(
    original.id,
    version.code.replace('toHaveText("Welcome Grace")', 'toHaveText("Welcome Ada")'),
  );
  const failing = await createRun({
    mode: 'replay',
    sourceRunId: original.id,
    recordingVersionId: incorrect.id,
  });
  await executeRun(failing);
  const failure = await getRun(failing.id);
  expect(failure.status).toBe('failed');
  expect(failure.error).toContain('Welcome Ada');
  const step = failure.steps.find((s) => s.status === 'failed')!;
  expect(step.playwrightAssertion?.type).toBe('toHaveText');
  expect(failure.artifacts.some((a) => a.stepId === step.id && a.stage === 'after')).toBe(true);
}, 30000);
