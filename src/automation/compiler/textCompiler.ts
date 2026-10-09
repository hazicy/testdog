import { generateWithOpenAI } from '@/automation/deepseek';
import { type JSONType, z } from 'zod';
import { NodeSchema, PlanSchema, type Plan } from './schema';

const id = z.string().trim().min(1);
const ids = z.array(id);

// The provider uses strict objects; a node array avoids dynamic object keys in its schema.
function objectSchema(properties: Record<string, JSONType>): JSONType {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}
const stringSchema = { type: 'string' };
const arraySchema = { type: 'array', items: stringSchema };
const schema = objectSchema({
  rootId: stringSchema,
  nodes: {
    type: 'array',
    items: {
      anyOf: [
        objectSchema({
          kind: { type: 'string', enum: ['group'] },
          id: stringSchema,
          goal: stringSchema,
          children: arraySchema,
          dependsOn: arraySchema,
        }),
        objectSchema({
          kind: { type: 'string', enum: ['task'] },
          id: stringSchema,
          goal: stringSchema,
          dependsOn: arraySchema,
          requirementIds: arraySchema,
          assertions: { type: 'array', items: objectSchema({ description: stringSchema }) },
        }),
        objectSchema({
          kind: { type: 'string', enum: ['branch'] },
          id: stringSchema,
          condition: stringSchema,
          then: stringSchema,
          otherwise: { type: ['string', 'null'] },
          dependsOn: arraySchema,
        }),
      ],
    },
  },
});
const CompiledSchema = z
  .object({
    rootId: id,
    nodes: z
      .array(
        z.union([
          NodeSchema,
          z
            .object({
              kind: z.literal('branch'),
              id,
              condition: id,
              then: id,
              otherwise: z.null(),
              dependsOn: ids,
            })
            .strict(),
        ]),
      )
      .min(1),
  })
  .strict();

export class TextCompiler {
  async compile(goal: string, startUrl?: string): Promise<Plan> {
    const response = await generateWithOpenAI({
      systemPrompt: `将用户的自动化测试用例编译为逻辑嵌套、结构扁平的执行计划，只返回 JSON。
rootId 指向根节点。nodes 是节点数组，每个节点有唯一 id；所有引用只使用 id，禁止内嵌节点。
group 用 goal 描述分组，children 是按执行顺序排列的非空节点 ID 数组，允许引用嵌套 group。
task 是浏览器执行的完整子目标，goal 必须保留用户指定的输入值、URL、操作顺序和环境上下文。
requirementIds 只使用用户明确提供的需求 ID，没有则为空数组，不得编造。
assertions 只包含用户明确要求的验证，用 description 忠实保留预期，不得编造成功提示或额外验证。
中途验证放在对应 task 的 assertions；最终验证放在相应最后一个 task 的 assertions。无操作的验证也可用 task 表达。
branch 只用于用户明确要求的条件分支，condition 是可从当前页面观察判断的条件，then 和 otherwise 指向节点 ID；没有否则分支时 otherwise 返回 null。
dependsOn 是必须先完成的节点 ID 数组，无依赖时为空。所有引用必须存在，不得有循环依赖。
不要让分支后的任务直接依赖两条互斥分支，应依赖 branch 节点。不要在分支之外重复列出分支子节点。
前置环境仅作为上下文保留在 goal 中，不要编造建立环境的操作。
提供 startUrl 时执行器会先导航，省略这一步初始导航。不要编造 DOM 选择器、URL、重试或额外操作。`,
      messages: [
        { role: 'user', content: { type: 'text', text: JSON.stringify({ goal, startUrl }) } },
      ],
      temperature: 0,
      responseFormat: { type: 'json_schema', name: 'plan', schema },
    });
    const compiled = CompiledSchema.parse(response.structuredContent);
    const nodes: Plan['nodes'] = {};
    for (const node of compiled.nodes) {
      if (Object.hasOwn(nodes, node.id)) throw new Error(`Duplicate node id: ${node.id}`);
      const normalized =
        node.kind === 'branch' && node.otherwise === null
          ? {
              kind: node.kind,
              id: node.id,
              condition: node.condition,
              then: node.then,
              dependsOn: node.dependsOn,
            }
          : node;
      Object.defineProperty(nodes, node.id, {
        value: normalized,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return PlanSchema.parse({ rootId: compiled.rootId, nodes });
  }
}
