import {
  CompileRequestSchema,
  type CompileRequest,
} from '@testdog/contracts/automation/compiler/request';
import type { ModelClient } from '@testdog/contracts/automation/llm/contracts';
import { type JSONType, z } from 'zod';
import {
  NodeSchema,
  ExecutablePlanSchema,
  type Plan,
} from '@testdog/contracts/automation/compiler/schema';

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
          presentation: { type: ['string', 'null'], enum: ['sequence', null] },
        }),
        objectSchema({
          kind: { type: 'string', enum: ['task'] },
          actionType: { type: 'string', enum: ['act', 'assert', 'login', 'files', 'screenshot'] },
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
          z.strictObject({
            kind: z.literal('group'),
            id,
            goal: id,
            children: ids,
            dependsOn: ids,
            presentation: z.null(),
          }),
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
  .strict()
  .superRefine((plan, ctx) => {
    for (const node of plan.nodes)
      if (node.kind === 'group' && !node.children.length)
        ctx.addIssue({ code: 'custom', message: `Empty group: ${node.id}` });
  });

export class TextCompiler {
  constructor(private model: ModelClient) {}

  async compile(request: CompileRequest, signal?: AbortSignal): Promise<Plan> {
    const input = CompileRequestSchema.parse(request);
    let feedback = '';

    for (let attempt = 0; attempt < 2; attempt++) {
      signal?.throwIfAborted();
      const response = await this.model.generate({
        signal,
        systemPrompt: `将用户的自动化测试用例编译为逻辑嵌套、结构扁平的执行计划，只返回 JSON。
rootId 指向根节点。nodes 是节点数组，每个节点有唯一 id；所有引用只使用 id，禁止内嵌节点。
group 用 goal 描述分组，children 是按执行顺序排列的非空节点 ID 数组，允许引用嵌套 group。presentation 为 sequence 表示已有的顺序容器，调整时保留；普通分组返回 null。
task 的 actionType 为 act（一般操作）、assert（纯验证）、login（登录）、files（页面文件操作）、screenshot（仅截取当前画面）；按用户明确要求选择类型，不得编造额外步骤。assert 的 goal 是验证描述，assertions 包含同一描述；screenshot 不包含额外界面操作。
task 是界面自动化执行的完整子目标，goal 必须保留用户指定的输入值、URL、操作顺序和环境上下文。
requirementIds 只使用用户明确提供的需求 ID，没有则为空数组，不得编造。
assertions 只包含用户明确要求的验证，用 description 忠实保留预期，不得编造成功提示或额外验证。
中途验证放在对应 task 的 assertions；最终验证放在相应最后一个 task 的 assertions。无操作的验证也可用 task 表达。
branch 只用于用户明确要求的条件分支，condition 是可从当前界面观察判断的条件，then 和 otherwise 指向节点 ID；没有否则分支时 otherwise 返回 null。
dependsOn 是必须先完成的节点 ID 数组，无依赖时为空。所有引用必须存在，不得有循环依赖。
所有节点必须通过子节点或依赖连接到 rootId，不得保留无法执行的孤立节点。
children、then、otherwise 已经表达父节点到子节点的执行关系，子节点绝对不能 dependsOn 自己的父节点或任何祖先。分支子任务不得依赖包含它的 branch，分组子任务不得依赖包含它的 group。
不要让分支后的任务直接依赖两条互斥分支，应依赖 branch 节点。不要在分支之外重复列出分支子节点。
前置环境仅作为上下文保留在 goal 中，不要编造建立环境的操作。
提供 url 时 Web 执行器会先导航，省略这一步初始导航。context.platform 指定平台：原生测试使用应用界面，不得编造浏览器导航或 DOM 操作；appId 是应用上下文，执行器负责启动。不要编造选择器、URL、重试或额外操作。
输入引用 \${input.name} 必须按原文保留，context.inputs 提供引用的定义，secretRef 仅表示密钥引用，不得推测密钥值。
提供 currentPlan 时，goal 是修改要求；保留未要求修改的步骤、分支、输入引用、节点 ID 和依赖关系，修改节点保留其 ID，新增节点使用唯一 ID，返回完整计划。`,
        messages: [
          { role: 'user', content: { type: 'text', text: JSON.stringify(input) } },
          ...(feedback
            ? [{ role: 'user' as const, content: { type: 'text' as const, text: feedback } }]
            : []),
        ],
        temperature: 0,
        responseFormat: { type: 'json_schema', name: 'plan', schema },
      });

      try {
        const compiled = CompiledSchema.parse(response.structuredContent);
        const nodes: Plan['nodes'] = {};

        for (const node of compiled.nodes) {
          if (Object.hasOwn(nodes, node.id)) throw new Error(`Duplicate node id: ${node.id}`);
          const normalized =
            node.kind === 'group' && node.presentation === null
              ? {
                  kind: node.kind,
                  id: node.id,
                  goal: node.goal,
                  children: node.children,
                  dependsOn: node.dependsOn,
                }
              : node.kind === 'branch' && node.otherwise === null
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

        return ExecutablePlanSchema.parse({ rootId: compiled.rootId, nodes });
      } catch (error) {
        signal?.throwIfAborted();
        if (attempt === 1) throw error;
        feedback = `上一份计划未通过结构校验。请修正后重新生成完整计划，保留原用例的全部操作和预期。错误：${error instanceof Error ? error.message : String(error)}\n上一份计划：${JSON.stringify(response.structuredContent)}`;
      }
    }

    throw new Error('计划编译失败');
  }
}
