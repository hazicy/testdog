import OpenAI from 'openai';

import type {
  FunctionTool,
  ResponseInputContent,
  ResponseInputItem,
} from 'openai/resources/responses/responses';
import type { JSONType } from 'zod/v4';

type LLMContentBlock =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      data: string;
      mimeType: string;
    }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, JSONType>;
    }
  | {
      type: 'tool_result';
      toolUseId: string;
      content: Array<
        | {
            type: 'text';
            text: string;
          }
        | {
            type: 'image';
            data: string;
            mimeType: string;
          }
      >;
      structuredContent?: Record<string, JSONType>;
      isError?: boolean;
    };

type LLMGenerateParams = {
  messages: Array<{
    role: 'user' | 'assistant';
    content: LLMContentBlock | LLMContentBlock[];
  }>;

  systemPrompt?: string;

  temperature?: number;

  tools?: FunctionTool[];

  responseFormat?:
    | {
        type: 'text';
      }
    | {
        type: 'json_schema';
        name: string;
        description?: string;
        schema: JSONType;
      };
};

function isJSONObject(value: JSONType): value is Record<string, JSONType> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStructuredContent(outputText: string): JSONType {
  const content = JSON.parse(outputText) as JSONType;

  if (isJSONObject(content) && '$schema' in content) {
    const { $schema: _schema, ...result } = content;
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

export async function generateWithOpenAI(params: LLMGenerateParams) {
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

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: 'https://api.deepseek.com/beta',
  });

  const response = await openai.responses.create({
    model: 'deepseek-flash',
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
  });

  return {
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
