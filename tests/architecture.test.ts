import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { beforeAll, expect, it } from 'vitest';

const eslint = new ESLint();

beforeAll(async () => {
  await eslint.lintText('export const probe = 1;', {
    filePath: 'apps/web/src/components/BoundaryProbe.tsx',
  });
}, 30000);

async function violations(source: string, filePath = 'apps/web/src/components/BoundaryProbe.tsx') {
  const [result] = await eslint.lintText(source, { filePath });

  return result.messages.filter((message) => message.ruleId === 'no-restricted-imports');
}

it.each([
  '@testdog/server/db',
  '../../db/index',
  '@testdog/engine/llm/deepseek',
  '@/engine/llm/futureProvider',
  '@testdog/engine/evaluator',
  '@testdog/engine/planRunner',
  '@testdog/server/execution/runtime',
  '@testdog/engine/platform/web/replay',
  '@testdog/engine/platform/web/webPlanner',
  '@testdog/engine/platform/web/browserSession',
  '@testdog/engine/platform/web/observer',
  '../../engine/platform/web/pageReadiness.ts',
  '@testdog/engine/platform/web/webActions',
  '@testdog/engine/platform/web/webLocator',
  '@testdog/engine/platform/web/recordingLocator',
  '@testdog/engine/platform/native/nativePlanner',
  '../../engine/compiler/textCompiler.ts',
  '@testdog/server/runs/recordings',
  '../../server/runs/repository',
  '@testdog/server/runs/artifactResponse',
  '@testdog/server/runs/artifactStorage',
  '@/server/futureRepository',
  '@testdog/server/test-cases/repository',
  '@testdog/server/scheduling/scheduler',
  '@/server/realtime/eventStream',
  '@/server/shared/auth',
  '@testdog/server/testing/testDatabase',
  '../../server/execution/executeRun.ts',
])('blocks server runtime imports in browser components: %s', async (path) => {
  expect(await violations(`import '${path}';`)).toHaveLength(1);
});

it.each([
  "import { renderToStaticMarkup } from 'react-dom/server'; export { renderToStaticMarkup };",
  "import type { TestRun } from '@testdog/contracts/runs/types'; export type Run = TestRun;",
  "import { recordingScript } from '@testdog/contracts/runs/lib/recordingScript'; export { recordingScript };",
  "import { layoutPlan } from '../apps/web/src/features/runs/lib/planLayout'; export { layoutPlan };",
  "import { testSchema } from '@testdog/contracts/test-cases/schemas'; export { testSchema };",
])('permits shared browser utilities and erased type imports', async (source) => {
  expect(await violations(source)).toEqual([]);
});

it.each([
  'apps/web/src/features/workspace/components/BoundaryProbe.tsx',
  'apps/web/src/features/runs/hooks/useBoundaryProbe.ts',
  'apps/web/src/features/test-cases/components/BoundaryProbe.tsx',
])('applies browser boundaries to feature components and hooks: %s', async (filePath) => {
  for (const path of [
    '@testdog/server/db',
    '@testdog/server/execution/runtime',
    '@testdog/server/test-cases/repository',
    '@testdog/server/scheduling/lease',
    '@testdog/server/realtime/preview',
    '@testdog/server/infrastructure/redis',
    '@testdog/engine/llm/deepseek',
  ])
    expect(await violations(`import '${path}';`, filePath)).toHaveLength(1);
  expect(
    await violations(
      "import type { TestRun } from '@testdog/contracts/runs/types'; export type Run = TestRun;",
      filePath,
    ),
  ).toEqual([]);
});

it.each([
  './llm/deepseek',
  './platform/web/playwrightSession',
  '@testdog/engine/platform/native/agentDeviceSession',
  '@testdog/server/execution/runtime',
  '../apps/web/src/features/runs/components/RunDetail',
  '@testdog/contracts/runs/lib/recordingScript',
  '@testdog/server/db',
])('keeps platform, model and persistence implementations out of PlanRunner: %s', async (path) => {
  expect(await violations(`import '${path}';`, 'packages/engine/src/planRunner.ts')).toHaveLength(
    1,
  );
});

it('permits PlanRunner to depend on shared contracts and erased evaluator types', async () => {
  expect(
    await violations(
      "import { ObservationSchema } from '@testdog/contracts/execution/platform'; import type { Evaluator } from '@testdog/engine/platform/contracts'; export type Check = Evaluator; export { ObservationSchema };",
      'packages/engine/src/planRunner.ts',
    ),
  ).toEqual([]);
});

it.each([
  'packages/engine/src/compiler/textCompiler.ts',
  'packages/engine/src/evaluator.ts',
  'packages/engine/src/platform/web/webPlanner.ts',
  'packages/engine/src/platform/native/nativePlanner.ts',
])(
  'requires model injection and permits the provider independent contract in %s',
  async (filePath) => {
    for (const path of [
      '@testdog/engine/llm/deepseek',
      '../../llm/futureProvider.ts',
      'openai/resources/responses/responses',
      '@testdog/server/infrastructure/model',
    ])
      expect(await violations(`import '${path}';`, filePath)).toHaveLength(1);
    expect(
      await violations(
        "import type { ModelClient } from '@testdog/engine/llm/contracts'; export type Client = ModelClient;",
        filePath,
      ),
    ).toEqual([]);
  },
);

it.each([
  'packages/engine/src/platform/web/playwrightSession.ts',
  'packages/engine/src/platform/web/recordingLocator.ts',
])('keeps Web sessions and recording locators independent of persistence: %s', async (filePath) => {
  for (const path of [
    '@testdog/server/execution/recording/webRecorder',
    '../../../../server/runs/repository.ts',
    '@testdog/server/db',
  ])
    expect(await violations(`import '${path}';`, filePath)).toHaveLength(1);
  expect(
    await violations(
      "import type { RecordedAction } from './types'; export type Action = RecordedAction;",
      filePath,
    ),
  ).toEqual([]);
});

it.each([
  ['packages/contracts/src/BoundaryProbe.ts', '@testdog/engine/planRunner'],
  ['packages/contracts/src/BoundaryProbe.ts', '@testdog/engine/llm/contracts'],
  ['packages/contracts/src/BoundaryProbe.ts', '@testdog/engine/platform/contracts'],
  ['packages/contracts/src/BoundaryProbe.ts', '@testdog/server/runs/repository'],
  ['packages/contracts/src/BoundaryProbe.ts', '@/client/api'],
  ['packages/engine/src/BoundaryProbe.ts', '@testdog/server/db'],
  ['packages/engine/src/BoundaryProbe.ts', '@/server/auth/auth'],
  ['packages/server/src/BoundaryProbe.ts', '@/server/shared/auth'],
  ['packages/server/src/BoundaryProbe.ts', 'next/server'],
  ['packages/server/src/BoundaryProbe.ts', 'better-auth/minimal'],
])('blocks reverse package dependencies in %s: %s', async (filePath, dependency) => {
  expect(await violations(`import '${dependency}';`, filePath)).toHaveLength(1);
});

it.each([
  ['contracts', []],
  ['engine', ['@testdog/contracts']],
  ['server', ['@testdog/contracts', '@testdog/engine']],
] as const)(
  'keeps %s package dependencies in the intended direction, including tests',
  (name, allowed) => {
    const manifest = JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8'));
    const internal = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(
      (dependency) => dependency.startsWith('@testdog/'),
    );

    expect(
      internal.filter((dependency) => !(allowed as readonly string[]).includes(dependency)),
    ).toEqual([]);
  },
);

it.each([
  '@testdog/server/execution/executeRun',
  '@testdog/server/execution/cancellation',
  '../execution/runtime',
])('keeps execution implementations out of run business modules: %s', async (dependency) => {
  expect(
    await violations(`import '${dependency}';`, 'packages/server/src/runs/submission.ts'),
  ).toHaveLength(1);
});

it('permits run business modules to use shared execution data', async () => {
  expect(
    await violations(
      "import { defaultWebTarget } from '@testdog/contracts/execution/target'; export { defaultWebTarget };",
      'packages/server/src/runs/submission.ts',
    ),
  ).toEqual([]);
});
