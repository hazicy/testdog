import type { ModelClient } from '@testdog/engine/llm/contracts';
import type { Plan } from '@testdog/contracts/execution/plan';
import type { TestRun } from '@testdog/contracts/runs/types';
import type {
  Evaluator,
  AutomationSession,
  ActionPlanner,
} from '@testdog/engine/platform/contracts';
import type { PlatformAction } from '@testdog/contracts/execution/platform';

export interface PlatformRuntime {
  session: AutomationSession;
  planner: ActionPlanner;
  evaluator: Evaluator;
  environment: Record<string, unknown>;
  initial?: PlatformAction;
  finalize(interrupted: boolean): Promise<void>;
  cleanup?(): Promise<void>;
  healthy: boolean;
}

export class RuntimeOpenError extends Error {
  constructor(
    cause: unknown,
    public healthy: boolean,
  ) {
    super('执行环境准备失败', { cause });
  }
}

export type RuntimeInput = {
  model?: ModelClient;
  run: TestRun;
  plan: Plan;
  expectedEnvironment?: Record<string, unknown>;
  resource?: { deviceId: string | null; metadata: Record<string, unknown> };
  signal: AbortSignal;
  report: (message: string) => Promise<void>;
};
