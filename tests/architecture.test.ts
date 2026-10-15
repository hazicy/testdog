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
  '@testdog/automation/llm/deepseek',
  '@/automation/llm/futureProvider',
  '@testdog/automation/evaluator',
  '@testdog/automation/planRunner',
  '@testdog/server/runs/runtime',
  '@testdog/automation/platform/web/replay',
  '@testdog/automation/platform/web/webPlanner',
  '@testdog/automation/platform/web/browserSession',
  '@testdog/automation/platform/web/observer',
  '../../automation/platform/web/pageReadiness.ts',
  '@testdog/automation/platform/web/webActions',
  '@testdog/automation/platform/web/webLocator',
  '@testdog/automation/platform/web/recordingLocator',
  '@testdog/automation/platform/native/nativePlanner',
  '../../automation/compiler/textCompiler.ts',
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
  '../../server/runs/run.ts',
])('blocks server runtime imports in browser components: %s', async (path) => {
  expect(await violations(`import '${path}';`)).toHaveLength(1);
});

it.each([
  "import { renderToStaticMarkup } from 'react-dom/server'; export { renderToStaticMarkup };",
  "import type { TestRun } from '@testdog/contracts/runs/types'; export type Run = TestRun;",
  "import { recordingScript } from '@testdog/contracts/runs/lib/recordingScript'; export { recordingScript };",
  "import { planForest } from '../apps/web/src/features/runs/lib/planTree'; export { planForest };",
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
    '@testdog/server/runs/runtime',
    '@testdog/server/test-cases/repository',
    '@testdog/server/scheduling/lease',
    '@testdog/server/realtime/preview',
    '@testdog/server/shared/redis',
    '@testdog/automation/llm/deepseek',
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
  '@testdog/automation/platform/native/agentDeviceSession',
  '@testdog/server/runs/runtime',
  '../apps/web/src/features/runs/components/RunDetail',
  '@testdog/contracts/runs/lib/recordingScript',
  '@testdog/server/db',
])('keeps platform, model and persistence implementations out of PlanRunner: %s', async (path) => {
  expect(
    await violations(`import '${path}';`, 'packages/automation/src/planRunner.ts'),
  ).toHaveLength(1);
});

it('permits PlanRunner to depend on shared contracts and erased evaluator types', async () => {
  expect(
    await violations(
      "import { ObservationSchema } from './platform/contracts'; import type { Evaluator } from './evaluator'; export type Check = Evaluator; export { ObservationSchema };",
      'packages/automation/src/planRunner.ts',
    ),
  ).toEqual([]);
});

it.each([
  'packages/automation/src/compiler/textCompiler.ts',
  'packages/automation/src/evaluator.ts',
  'packages/automation/src/platform/web/webPlanner.ts',
  'packages/automation/src/platform/native/nativePlanner.ts',
])(
  'requires model injection and permits the provider independent contract in %s',
  async (filePath) => {
    for (const path of [
      '@testdog/automation/llm/deepseek',
      '../../llm/futureProvider.ts',
      'openai/resources/responses/responses',
      '@testdog/server/shared/model',
    ])
      expect(await violations(`import '${path}';`, filePath)).toHaveLength(1);
    expect(
      await violations(
        "import type { ModelClient } from '@testdog/contracts/automation/llm/contracts'; export type Client = ModelClient;",
        filePath,
      ),
    ).toEqual([]);
  },
);

it.each([
  'packages/automation/src/platform/web/playwrightSession.ts',
  'packages/automation/src/platform/web/recordingLocator.ts',
])('keeps Web sessions and recording locators independent of persistence: %s', async (filePath) => {
  for (const path of [
    '@testdog/server/runs/recorder',
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
  ['packages/contracts/src/BoundaryProbe.ts', '@testdog/automation/planRunner'],
  ['packages/contracts/src/BoundaryProbe.ts', '@testdog/server/runs/repository'],
  ['packages/contracts/src/BoundaryProbe.ts', '@/client/api'],
  ['packages/automation/src/BoundaryProbe.ts', '@testdog/server/db'],
  ['packages/automation/src/BoundaryProbe.ts', '@/server/auth/auth'],
  ['packages/server/src/BoundaryProbe.ts', '@/server/shared/auth'],
  ['packages/server/src/BoundaryProbe.ts', 'next/server'],
  ['packages/server/src/BoundaryProbe.ts', 'better-auth/minimal'],
])('blocks reverse package dependencies in %s: %s', async (filePath, dependency) => {
  expect(await violations(`import '${dependency}';`, filePath)).toHaveLength(1);
});

it.each([
  ['contracts', []],
  ['automation', ['@testdog/contracts']],
  ['server', ['@testdog/contracts', '@testdog/automation']],
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
