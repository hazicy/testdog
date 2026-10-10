import { deepseekClient } from '../llm/deepseek';
import { expect, test } from 'vitest';
import { TextCompiler } from './textCompiler';
import { PlanSchema } from './schema';

test.skipIf(process.env.RUN_LIVE_TESTS !== 'true')(
  'compiles a bounded real-model case with a valid plan and explicit expectations',
  async () => {
    const plan = await new TextCompiler(deepseekClient).compile(
      '打开首页，验证主标题显示 Example Domain。',
      'https://example.com',
      AbortSignal.timeout(45000),
    );

    expect(PlanSchema.safeParse(plan).success).toBe(true);
    const assertions = Object.values(plan.nodes).flatMap((node) =>
      node.kind === 'task' ? node.assertions : [],
    );

    expect(assertions.length).toBeGreaterThan(0);
    expect(assertions.some((assertion) => assertion.description.includes('Example Domain'))).toBe(
      true,
    );
  },
  60000,
);
