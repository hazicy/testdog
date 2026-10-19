import { createServer, type Server } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { TestRun } from '@testdog/contracts/runs/types';
import type { ModelUsage } from '@testdog/contracts/runs/modelCalls';
import { regressionCases } from './cases';

const state = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));

vi.mock('@testdog/server/db', async () => {
  const result = await (await import('@testdog/server/testing/testDatabase')).createTestDatabase();

  state.client = result.client;

  return { db: result.db };
});
import { saveTest } from '@testdog/server/test-cases/repository';
import { createRun } from '@testdog/server/runs/submission';
import { getRun } from '@testdog/server/runs/repository';
import { readModelUsage } from '@testdog/server/runs/modelUsage';
import { executeTestRun } from '@testdog/server/testing/executeTestRun';

const enabled = process.env.RUN_WORKSPACE_LIVE_TESTS === 'true';
const rounds = Number(process.env.TESTDOG_REGRESSION_ROUNDS ?? 3);
const session = new Date().toISOString().replace(/[:.]/g, '-');
const directory = resolve('test-results/regression', session);
const observed = new Map<string, string>();
const results: {
  caseId: string;
  round: number;
  mode: TestRun['mode'];
  runId?: string;
  passed: boolean;
  durationMs?: number;
  errorCode?: string;
  error?: string;
  oracle?: string;
  modelUsage?: ModelUsage;
}[] = [];
let server: Server | undefined;
let origin: string;

async function report() {
  await writeFile(
    join(directory, 'summary.json'),
    JSON.stringify(
      {
        scope: 'local-engine-baseline',
        startedAt: session,
        rounds,
        planned: regressionCases.length * rounds * 2,
        completed: results.length,
        passed: results.filter((result) => result.passed).length,
        passRate: results.length
          ? results.filter((result) => result.passed).length / results.length
          : null,
        results,
      },
      null,
      2,
    ),
  );
}

beforeAll(async () => {
  if (!enabled) return;
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10)
    throw new Error('TESTDOG_REGRESSION_ROUNDS 必须是 1～10 的整数');
  await mkdir(directory, { recursive: true });
  vi.stubEnv('TESTDOG_DATA_DIR', directory);
  vi.stubEnv('TESTDOG_ARTIFACT_BUCKET', '');
  vi.stubEnv('AUTOMATION_HEADLESS', 'true');
  const html = await readFile(new URL('./page.html', import.meta.url));

  server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;

    if (request.method === 'POST' && path.startsWith('/result/')) {
      const chunks: Buffer[] = [];

      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      observed.set(
        path.slice('/result'.length).replace(/\/register$/, ''),
        Buffer.concat(chunks).toString(),
      );
      response.end('ok');

      return;
    }

    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(html);
  });
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await report();
});

it.skipIf(!enabled).each(regressionCases)(
  '$id: records and replays across rounds',
  async (item) => {
    for (let round = 1; round <= rounds; round++) {
      const path = `/${item.id}/${round}`;
      let source: TestRun | undefined;

      for (const mode of ['record', 'replay'] as const) {
        observed.delete(path);
        let run: TestRun | undefined;

        try {
          if (mode === 'record') {
            const test = await saveTest(
              {
                name: `回归基线：${item.id} · ${round}`,
                url: origin + path,
                goal: `${item.goal}验证页面显示“${item.expected}”。`,
                tags: ['regression', 'engine-baseline'],
              },
              undefined,
              null,
            );

            run = await createRun({ testId: test.id }, undefined, null);
          } else {
            if (!source?.replayable || source.status !== 'passed')
              throw new Error('本轮录制未通过或不可重放，重放被阻塞');
            run = await createRun({ mode: 'replay', sourceRunId: source.id }, undefined, null);
          }

          await executeTestRun(run);
          const result = await getRun(run.id, { userId: null });
          const oracle = observed.get(path);

          if (mode === 'record') source = result;
          await writeFile(
            join(directory, `${item.id}-${round}-${mode}.json`),
            JSON.stringify(result, null, 2),
          );
          results.push({
            caseId: item.id,
            round,
            mode,
            runId: result.id,
            passed:
              result.status === 'passed' &&
              result.evidenceComplete === true &&
              oracle === item.expected,
            durationMs: result.durationMs,
            errorCode: result.errorCode,
            error: result.error,
            oracle,
            modelUsage: await readModelUsage(result.id),
          });
        } catch (error) {
          results.push({
            caseId: item.id,
            round,
            mode,
            runId: run?.id,
            passed: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        await report();
      }
    }

    expect(results.filter((result) => result.caseId === item.id && !result.passed)).toEqual([]);
  },
  13_200_000,
);

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  await state.client?.close();
  vi.unstubAllEnvs();
});
