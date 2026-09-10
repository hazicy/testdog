import OpenAI from 'openai';

import type {
  ResponseInputContent,
  ResponseInputItem,
} from 'openai/resources/responses/responses';
import type { JSONType } from 'zod/v4';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

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

function messageContent(
  content: LLMContentBlock | LLMContentBlock[],
): ResponseInputContent[] {
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
      `Stagehand tool content (${block.type}) is not supported by this JSON Schema-only adapter`,
    );
  });
}

export async function generateWithOpenAI(params: LLMGenerateParams) {
  if (params.responseFormat?.type !== 'json_schema') {
    throw new TypeError('Stagehand only issues structured generations');
  }

  if (!isJSONObject(params.responseFormat.schema)) {
    throw new TypeError(
      'The JSON Schema response format requires an object schema',
    );
  }

  const input: ResponseInputItem[] = params.messages.map(
    (message): ResponseInputItem => ({
      role: message.role,
      content: messageContent(message.content),
    }),
  );

  const response = await openai.responses.create({
    model: 'deepseek-v4-flash',
    instructions: params.systemPrompt,
    input,
    temperature: params.temperature,
    text: {
      format: {
        type: 'json_schema',
        name: params.responseFormat.name,
        schema: params.responseFormat.schema,
        strict: true,
      },
    },
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

    outputFormat: 'json_schema' as const,

    structuredContent: JSON.parse(response.output_text),
  };
}
