import { deepseekClient } from '@testdog/automation/llm/deepseek';
import { expect, test } from 'vitest';
import { TextCompiler } from '@testdog/automation/compiler/textCompiler';
import { PlanSchema } from '@testdog/contracts/automation/compiler/schema';

test.skipIf(process.env.RUN_LIVE_TESTS !== 'true')(
  'compiles a bounded real-model case with a valid plan and explicit expectations',
  async () => {
    const plan = await new TextCompiler(deepseekClient).compile(
      { goal: '打开首页，验证主标题显示 Example Domain。', url: 'https://example.com' },
      AbortSignal.timeout(45000),
    );

    expect(PlanSchema.safeParse(plan).success).toBe(true);
    expect(Object.values(plan.nodes)).toContainEqual(
      expect.objectContaining({
        kind: 'task',
        actionType: 'navigate',
        goal: 'https://example.com',
      }),
    );
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
