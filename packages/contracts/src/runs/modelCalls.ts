import type { ExecutionStep } from './types';

export type ModelCallTrace = {
  input?: { role: 'system' | 'user' | 'assistant'; content: string }[];
  reply: string;
  tools: { id: string; name: string; arguments: string }[];
  purpose?: string;
  truncated?: boolean;
};

export type ModelCallSummary = {
  id: string;
  startedAt: string;
  durationMs: number;
  model: string;
  status: 'passed' | 'failed' | 'cancelled' | 'timeout';
  retryCount: number;
  failedAttempts: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  errorCode?: string | null;
  hasTrace?: boolean;
  purpose?: string | null;
  preview?: string | null;
};

export type ModelCallDetail = {
  trace: ModelCallTrace | null;
  steps: Pick<
    ExecutionStep,
    | 'id'
    | 'toolCallId'
    | 'kind'
    | 'title'
    | 'status'
    | 'startedAt'
    | 'finishedAt'
    | 'durationMs'
    | 'evidence'
    | 'error'
    | 'decision'
    | 'action'
  >[];
};

export type ModelUsage = {
  calls: number;
  failures: number;
  retries: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  unknownUsage: number;
};
