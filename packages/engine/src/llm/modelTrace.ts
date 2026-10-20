import type {
  LLMGenerateParams,
  LLMGenerateResult,
} from '@testdog/contracts/automation/llm/contracts';
import type { ModelCallTrace } from '@testdog/contracts/runs/modelCalls';

// Bound persisted text and omit image payloads and structured credential fields.
export function modelTrace(params: LLMGenerateParams, result?: LLMGenerateResult): ModelCallTrace {
  let truncated = false;

  function limit(value: string, length: number) {
    if (value.length <= length) return value;
    truncated = true;

    return value.slice(0, length);
  }

  function text(value: string) {
    try {
      return JSON.stringify(JSON.parse(value), (key, item) =>
        /password|secret|authorization|cookie|token|api[_-]?key/i.test(key) ? '[redacted]' : item,
      );
    } catch {
      return value;
    }
  }

  const input: NonNullable<ModelCallTrace['input']> = [];
  let remaining = 65536;

  function addInput(role: (typeof input)[number]['role'], value: string) {
    const content = limit(text(value), remaining);

    input.push({ role, content });
    remaining -= content.length;
  }

  if (params.systemPrompt) addInput('system', params.systemPrompt);
  for (const message of params.messages) {
    if (!remaining || input.length >= 128) {
      truncated = true;
      break;
    }

    const blocks = Array.isArray(message.content) ? message.content : [message.content];
    const value = blocks.map((block) => {
      if (block.type === 'text') return text(block.text);
      if (block.type === 'image') return `[图片：${block.mimeType}]`;

      return JSON.stringify(block, (key, item) => {
        if (item?.type === 'image') return { type: 'image', mimeType: item.mimeType };
        if (key === 'text' && typeof item === 'string') return text(item);

        return item;
      });
    });

    addInput(message.role, value.join('\n\n'));
  }

  const reply = limit(
    text(
      result?.content?.text ||
        (result?.structuredContent === undefined ? '' : JSON.stringify(result.structuredContent)),
    ),
    65536,
  );
  const tools = (result?.toolCalls || []).slice(0, 32).map((call) => ({
    id: call.id,
    name: limit(call.name, 256),
    arguments: limit(text(call.arguments), 16384),
  }));

  return {
    input,
    reply,
    tools,
    purpose: params.responseFormat?.type === 'json_schema' ? params.responseFormat.name : undefined,
    ...(truncated || (result?.toolCalls?.length || 0) > tools.length ? { truncated: true } : {}),
  };
}
