import type { ModelClient } from '@testdog/contracts/automation/llm/contracts';
import type { Plan } from '@testdog/contracts/automation/compiler/schema';
import type { TestRun } from '@testdog/contracts/runs/types';
import type { Evaluator } from '@testdog/automation/evaluator';
import type {
  AutomationSession,
  ActionPlanner,
  PlatformAction,
} from '@testdog/contracts/automation/platform/contracts';

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
