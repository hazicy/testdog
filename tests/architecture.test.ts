import { ESLint } from 'eslint';
import { beforeAll, expect, it } from 'vitest';

const eslint = new ESLint();

beforeAll(async () => {
  await eslint.lintText('export const probe = 1;', {
    filePath: 'src/components/BoundaryProbe.tsx',
  });
}, 30000);

async function violations(source: string) {
  const [result] = await eslint.lintText(source, { filePath: 'src/components/BoundaryProbe.tsx' });

  return result.messages.filter((message) => message.ruleId === 'no-restricted-imports');
}

it.each([
  '@/db',
  '../../db/index',
  '@/automation/llm/deepseek',
  '@/automation/llm/jev',
  '@/automation/platform/web/webPlanner',
  '@/automation/platform/web/browserSession',
  '@/automation/platform/web/observer',
  '../../automation/platform/web/pageReadiness.ts',
  '@/automation/platform/web/webActions',
  '@/automation/platform/web/webLocator',
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
