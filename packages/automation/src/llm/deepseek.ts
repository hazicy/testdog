import OpenAI from 'openai';

import type { ResponseInputContent, ResponseInputItem } from 'openai/resources/responses/responses';
import type { JSONType } from 'zod/v4';
import type {
  LLMContentBlock,
  LLMGenerateParams,
  LLMGenerateResult,
  ModelClient,
} from '@testdog/contracts/automation/llm/contracts';

function isJSONObject(value: JSONType): value is Record<string, JSONType> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStructuredContent(outputText: string): JSONType {
  const text = outputText.trim();
  // Some providers wrap structured output in a complete Markdown code block.
  const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```$/i.exec(text);
  const content = JSON.parse(fenced?.[1] ?? text) as JSONType;

  if (isJSONObject(content) && '$schema' in content) {
    const result = { ...content };

    delete result.$schema;

    return result;
  }

  return content;
}

function messageContent(content: LLMContentBlock | LLMContentBlock[]): ResponseInputContent[] {
  const blocks = Array.isArray(content) ? content : [content];

  return blocks.map((block): ResponseInputContent => {
    if (block.type === 'text') {
      return {
        type: 'input_text',
        text: block.text,
      };
    }

    if (block.type === 'image') {
      return {
        type: 'input_image',
        image_url: `data:${block.mimeType};base64,${block.data}`,
        detail: 'auto',
      };
    }

    throw new TypeError(
      `Tool history (${block.type}) is not supported; send current state in a fresh request`,
    );
  });
}

let sdk: OpenAI | undefined;

async function generate(params: LLMGenerateParams): Promise<LLMGenerateResult> {
  if (
    params.responseFormat?.type === 'json_schema' &&
    !isJSONObject(params.responseFormat.schema)
  ) {
    throw new TypeError('The JSON Schema response format requires an object schema');
  }

  const input: ResponseInputItem[] = params.messages.map((message): ResponseInputItem => ({
    role: message.role,
    content: messageContent(message.content),
  }));

  const openai = (sdk ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: 'https://api.deepseek.com/beta',
    maxRetries: 0,
    timeout: 60000,
  }));

  const response = await openai.responses.create(
    {
      model: 'deepseek-flash',
      ...(params.maxOutputTokens ? { max_output_tokens: params.maxOutputTokens } : {}),
      instructions: params.systemPrompt,
      input,
      temperature: params.temperature,
      ...(params.responseFormat?.type === 'json_schema'
        ? {
            text: {
              format: {
                type: 'json_schema' as const,
                name: params.responseFormat.name,
                schema: params.responseFormat.schema as Record<string, unknown>,
              },
            },
          }
        : {}),
      ...(params.tools?.length
        ? { tools: params.tools, parallel_tool_calls: false, tool_choice: 'auto' as const }
        : {}),
      reasoning: {
        effort: 'none',
      },
    },
    { signal: params.signal },
  );

  return {
    model: response.model ?? 'deepseek-flash',
    usage: response.usage
      ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
      : undefined,
    role: 'assistant' as const,

    content: {
      type: 'text' as const,
      text: response.output_text,
    },

    toolCalls: response.output
      .filter((item) => item.type === 'function_call')
      .map((item) => ({ id: item.call_id, name: item.name, arguments: item.arguments })),

    outputFormat: params.responseFormat?.type ?? 'text',

    structuredContent:
      params.responseFormat?.type === 'json_schema'
        ? parseStructuredContent(response.output_text)
        : undefined,
  };
}

export const deepseekClient: ModelClient = { generate };
