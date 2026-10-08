import { generateWithOpenAI } from '@/ai/provider/deepseek';
import { type JSONType, z } from 'zod';
import type { Assertion, Compiler, TestCase, TestStep } from './type';

const AssertionSchema = z.object({ description: z.string().min(1) }).strict();
const InputSchema = z.object({ name: z.string().min(1), value: z.string() }).strict();
type CompiledStep =
  | { type: 'action'; goal: string; inputs: z.infer<typeof InputSchema>[] }
  | { type: 'group'; name: string; steps: CompiledStep[] }
  | { type: 'assert'; assertion: Assertion };

const CompiledStepSchema: z.ZodType<CompiledStep> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z
      .object({ type: z.literal('action'), goal: z.string().min(1), inputs: z.array(InputSchema) })
      .strict(),
    z
      .object({
        type: z.literal('group'),
        name: z.string().min(1),
        steps: z.array(CompiledStepSchema).min(1),
      })
      .strict(),
    z.object({ type: z.literal('assert'), assertion: AssertionSchema }).strict(),
  ]),
);
const CompiledCaseSchema = z
  .object({
    name: z.string().min(1),
    preconditions: z.array(z.string()),
    steps: z.array(CompiledStepSchema).min(1),
    assertions: z.array(AssertionSchema),
  })
  .strict();

// Explicit provider dialect: anyOf branches are complete objects, recursion is in steps.items.
function objectSchema(properties: Record<string, JSONType>): JSONType {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}
const stringSchema = { type: 'string' };
const assertionSchema = objectSchema({ description: stringSchema });
const stepArraySchema = { type: 'array', items: { $ref: '#/$def/step' } };
const caseSchema: JSONType = {
  ...(objectSchema({
    name: stringSchema,
    preconditions: { type: 'array', items: stringSchema },
    steps: stepArraySchema,
    assertions: { type: 'array', items: assertionSchema },
  }) as Record<string, JSONType>),
  $def: {
    step: {
      anyOf: [
        objectSchema({
          type: { type: 'string', enum: ['action'] },
          goal: stringSchema,
          inputs: {
            type: 'array',
            items: objectSchema({ name: stringSchema, value: stringSchema }),
          },
        }),
        objectSchema({
          type: { type: 'string', enum: ['group'] },
          name: stringSchema,
          steps: stepArraySchema,
        }),
        objectSchema({
          type: { type: 'string', enum: ['assert'] },
          assertion: assertionSchema,
        }),
      ],
    },
  },
};

export class TextCompiler implements Compiler {
  async compile(goal: string, startUrl?: string): Promise<TestCase> {
    const response = await generateWithOpenAI({
      systemPrompt: `将用户的自动化测试用例编译为用例定义，只返回 JSON，不要 Markdown 代码块或解释。
name 是简短的用例名称。preconditions 只保留用户明确指定的环境条件，不能把需要执行的操作放入前置条件。
steps 按执行顺序排列，包含 action、group 或 assert。
action 是可直接交给浏览器执行器完成的子目标，可以包含多次填写、点击或导航；例如登录和导入标签都可作为 action。
group 仅用于有意义的步骤分组，必须有非空 steps，允许嵌套；不要机械地为每次点击分组。
inputs 是 name/value 键值数组，保留用户指定的所有输入值，每个 action 内参数名唯一；没有输入时返回空数组。
assert 步骤用于用户明确要求的中途验证；assertions 用于用户明确要求的最终验证。
断言 description 必须忠实保留用户预期，不得编造业务规则、成功提示文案或额外验证。用户没有要求断言时返回空 assertions。
保留用户指定的操作、顺序、URL、输入值和序号意图。不要编造 DOM 选择器或未提供的 URL。
如果提供 startUrl，执行器会先导航到该地址，省略这一步初始导航。
不要添加重试或重新开始的循环，不要在用户要求的操作序列完成后追加操作。`,
      messages: [
        { role: 'user', content: { type: 'text', text: JSON.stringify({ goal, startUrl }) } },
      ],
      temperature: 0,
      responseFormat: { type: 'json_schema', name: 'test_case', schema: caseSchema },
    });

    const compiled = CompiledCaseSchema.parse(response.structuredContent);
    let nextId = 0;
    const toStep = (step: CompiledStep): TestStep => {
      const id = `step-${++nextId}`;
      if (step.type === 'group') return { id, ...step, steps: step.steps.map(toStep) };
      if (step.type === 'assert') return { id, ...step };
      const inputs: Record<string, string> = Object.fromEntries(
        step.inputs.map(({ name, value }) => [name, value]),
      );
      if (Object.keys(inputs).length !== step.inputs.length) {
        throw new Error(`Duplicate input names in action ${id}`);
      }
      return { id, type: 'action', goal: step.goal, inputs };
    };
    return {
      name: compiled.name,
      ...(startUrl !== undefined ? { startUrl } : {}),
      preconditions: compiled.preconditions,
      steps: compiled.steps.map(toStep),
      assertions: compiled.assertions,
    };
  }
}
