import type { JSONType } from 'zod/v4';

export type FunctionTool = {
  type: 'function';
  name: string;
  description?: string | null;
  parameters: Record<string, unknown> | null;
  strict: boolean | null;
};

export type LLMContentBlock =
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

export type LLMGenerateParams = {
  signal?: AbortSignal;
  maxOutputTokens?: number;
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

export type LLMGenerateResult = {
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
  role: 'assistant';
  content: { type: 'text'; text: string };
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  outputFormat: 'text' | 'json_schema';
  structuredContent?: JSONType;
};

export interface ModelClient {
  generate(params: LLMGenerateParams): Promise<LLMGenerateResult>;
}
