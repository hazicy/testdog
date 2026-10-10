import { ESLint } from 'eslint';
import { beforeAll, expect, it } from 'vitest';

const eslint = new ESLint();

beforeAll(async () => {
  await eslint.lintText('export const probe = 1;', {
    filePath: 'src/components/BoundaryProbe.tsx',
  });
}, 30000);

async function violations(source: string, filePath = 'src/components/BoundaryProbe.tsx') {
  const [result] = await eslint.lintText(source, { filePath });

  return result.messages.filter((message) => message.ruleId === 'no-restricted-imports');
}

it.each([
  '@/db',
  '../../db/index',
  '@/automation/llm/deepseek',
  '@/automation/llm/jev',
  '@/automation/evaluator',
  '@/automation/planRunner',
  '@/workspace/server/runtime',
  '@/automation/platform/web/replay',
  '@/automation/platform/web/webPlanner',
  '@/automation/platform/web/browserSession',
  '@/automation/platform/web/observer',
  '../../automation/platform/web/pageReadiness.ts',
  '@/automation/platform/web/webActions',
  '@/automation/platform/web/webLocator',
  '@/automation/platform/web/recordingLocator',
  '@/automation/platform/web/executor',
  '@/automation/platform/native/nativePlanner',
  '../../automation/compiler/textCompiler.ts',
  '@/workspace/server/recordings',
  '../../workspace/server/store',
  '@/workspace/server/artifactResponse',
  '@/workspace/server/artifactStorage',
  '@/workspace/server/futureRepository',
  '../../workspace/server/run.ts',
])('blocks server runtime imports in browser components: %s', async (path) => {
  expect(await violations(`import '${path}';`)).toHaveLength(1);
});

it.each([
  "import type { TestRun } from '@/workspace/types'; export type Run = TestRun;",
  "import type { Executor } from '../../automation/platform/web/executor'; export type Runner = Executor;",
  "import { recordingScript } from '@/workspace/recordingScript'; export { recordingScript };",
  "import { planForest } from '@/workspace/planTree'; export { planForest };",
  "import { testSchema } from '@/workspace/validation'; export { testSchema };",
])('permits shared browser utilities and erased type imports', async (source) => {
  expect(await violations(source)).toEqual([]);
});

it.each([
  './llm/deepseek',
  './platform/web/playwrightSession',
  '@/automation/platform/native/agentDeviceSession',
  '@/workspace/server/runtime',
  '@/db',
])('keeps platform, model and persistence implementations out of PlanRunner: %s', async (path) => {
  expect(await violations(`import '${path}';`, 'src/automation/planRunner.ts')).toHaveLength(1);
});

it('permits PlanRunner to depend on shared contracts and erased evaluator types', async () => {
  expect(
    await violations(
      "import { ObservationSchema } from './platform/contracts'; import type { Evaluator } from './evaluator'; export type Check = Evaluator; export { ObservationSchema };",
      'src/automation/planRunner.ts',
    ),
  ).toEqual([]);
});

it.each([
  'src/automation/compiler/textCompiler.ts',
  'src/automation/evaluator.ts',
  'src/automation/platform/web/webPlanner.ts',
  'src/automation/platform/web/executor.ts',
  'src/automation/platform/native/nativePlanner.ts',
])(
  'requires model injection and permits the provider independent contract in %s',
  async (filePath) => {
    for (const path of [
      '@/automation/llm/deepseek',
      '../../llm/jev.ts',
      'openai/resources/responses/responses',
      '@/workspace/server/model',
    ])
      expect(await violations(`import '${path}';`, filePath)).toHaveLength(1);
    expect(
      await violations(
        "import type { ModelClient } from '@/automation/llm/contracts'; export type Client = ModelClient;",
        filePath,
      ),
    ).toEqual([]);
  },
);

it.each([
  'src/automation/platform/web/playwrightSession.ts',
  'src/automation/platform/web/recordingLocator.ts',
])('keeps Web sessions and recording locators independent of persistence: %s', async (filePath) => {
  for (const path of [
    '@/workspace/server/recorder',
    '../../../../workspace/server/store.ts',
    '@/db',
  ])
    expect(await violations(`import '${path}';`, filePath)).toHaveLength(1);
  expect(
    await violations(
      "import type { RecordedAction } from './types'; export type Action = RecordedAction;",
      filePath,
    ),
  ).toEqual([]);
});
