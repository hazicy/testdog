import { randomUUID } from 'node:crypto';
import type { PlanNode } from './compiler/schema';
import {
  PlatformActionSchema,
  ObservationSchema,
  CapabilitySetSchema,
  PlatformAssertionSchema,
  type PlatformAction,
  type RunnerOptions,
  type SessionEvent,
  type ReplayStep,
} from './platform/contracts';

// Owns business sequencing only. Driver objects and evidence capture belong to sessions.
export class PlanRunner {
  private nodeId?: string;
  constructor(private options: RunnerOptions) {
    CapabilitySetSchema.parse(options.session.capabilities);
  }
  private async observe() {
    const { session, signal } = this.options;
    const observation = ObservationSchema.parse(await session.observe(signal));
    if (
      observation.sessionId !== session.id ||
      observation.surface.platform !== session.platform ||
      observation.revision !== session.revision
    )
      throw new Error('Observation session/revision mismatch');

    return observation;
  }
  async record(initial?: PlatformAction) {
    if (initial) await this.action(initial);
    await this.visit(this.options.plan.rootId, new Set(), new Set());
  }
  async replay(steps: ReplayStep[]) {
    const { session, signal } = this.options;
    for (const step of steps) {
      const { event } = step;

      this.nodeId = event.planNodeId;
      signal.throwIfAborted();
      await session.prepareReplayStep(step, signal);
      if (event.action) {
        await this.observe();
        await this.action(event.action);
      } else if (event.platformAssertion) {
        const assertion = PlatformAssertionSchema.parse(event.platformAssertion);
        if (
          assertion.platform !== session.platform ||
          !session.capabilities.assertions.includes(assertion.type)
        )
          throw new Error('Unsupported platform assertion');
        await this.traced(event, async () => {
          const result = await session.check(assertion, signal);
          if (!result.passed) throw new Error(result.evidence);

          return result;
        });
      } else if (event.assertion || event.condition) {
        await this.traced(event, async () => {
          const result = await this.evaluate(
            event.assertion ? { assertion: event.assertion } : { condition: event.condition },
            event.assertion ? 'assertion_result' : 'branch_result',
          );
          if (event.assertion ? !result.passed : result.passed !== event.decision)
            throw new Error(result.evidence);

          return result;
        });
      } else throw new Error(`Missing replay content: ${event.title}`);
    }
  }
  private async visit(id: string, completed: Set<string>, visiting: Set<string>): Promise<void> {
    this.options.signal.throwIfAborted();
    if (completed.has(id)) return;
    if (visiting.has(id)) throw new Error(`Cycle detected at node ${id}`);
    const node = this.options.plan.nodes[id];
    if (!node) throw new Error(`Unknown plan node: ${id}`);
    visiting.add(id);
    try {
      for (const dependency of node.dependsOn) await this.visit(dependency, completed, visiting);
      this.nodeId = id;
      if (node.kind === 'group') {
        for (const child of node.children) await this.visit(child, completed, visiting);
      } else if (node.kind === 'branch') {
        const result = await this.traced(
          { kind: 'branch', title: `判断条件：${node.condition}`, condition: node.condition },
          () => this.evaluate({ condition: node.condition }, 'branch_result'),
        );
        const next = result.passed ? node.then : node.otherwise;
        if (next) await this.visit(next, completed, visiting);
      } else {
        await this.options.report?.(`执行任务：${node.goal}`);
        await this.task(node);
        for (const assertion of node.assertions) {
          await this.traced(
            { kind: 'assertion', title: assertion.description, assertion },
            async () => {
              const result = await this.evaluate({ assertion }, 'assertion_result');
              if (!result.passed) throw new Error(result.evidence);

              return result;
            },
          );
        }
      }
      completed.add(id);
    } finally {
      visiting.delete(id);
    }
  }
  private async task(node: Extract<PlanNode, { kind: 'task' }>) {
    const { session, planner, signal } = this.options;
    const completedSteps: PlatformAction[] = [];
    let remainingWaitMs = 15000;
    let count = 0;
    while (true) {
      signal.throwIfAborted();
      const observation = await this.observe();
      const revision = session.revision;
      const decision = await planner.plan({
        goal: node.goal,
        observation,
        capabilities: session.capabilities,
        completedSteps,
        remainingWaitMs,
      });

      signal.throwIfAborted();
      if (revision !== session.revision) continue;
      if (decision.done) return;
      if (!decision.steps.length) throw new Error('Planner returned no actions');
      for (const supplied of decision.steps) {
        const step = PlatformActionSchema.parse(supplied);
        if (step.action.type === 'wait') {
          if (remainingWaitMs <= 0) throw new Error(`Wait budget exceeded: ${node.goal}`);
          const budget = Math.min(step.action.timeoutMs, remainingWaitMs);

          remainingWaitMs -= budget;
          step.action.timeoutMs = budget;
        } else if (++count > 20) throw new Error(`Exceeded 20 actions: ${node.goal}`);
        await this.action(step);
        completedSteps.push(step);
        // The session owns whether dispatched actions require a fresh observation.
        if (session.executionPolicy.reobserveAfterAction || revision !== session.revision) break;
      }
    }
  }
  private action(action: PlatformAction) {
    action = PlatformActionSchema.parse(action);
    const { session, signal } = this.options;
    if (
      action.platform !== session.platform ||
      !session.capabilities.actions.includes(action.action.type)
    )
      throw new Error(`Unsupported ${action.platform} action: ${action.action.type}`);

    return this.traced(
      {
        kind:
          action.action.type === 'navigate'
            ? 'navigate'
            : action.action.type === 'wait'
              ? 'wait'
              : 'action',
        title: `${action.action.type}`,
        action,
      },
      () => session.perform(action, signal),
    );
  }
  private async evaluate(subject: Record<string, unknown>, name: string) {
    const observation = await this.observe();

    return this.options.evaluator.evaluate({
      subject,
      name,
      observation,
      signal: this.options.signal,
    });
  }
  private async traced<T>(
    entry: Omit<SessionEvent, 'id' | 'phase'>,
    operation: () => Promise<T>,
  ): Promise<T> {
    const { session, signal } = this.options;

    signal.throwIfAborted();
    const base = { ...entry, planNodeId: this.nodeId, id: randomUUID() };

    await session.emit({ ...base, phase: 'start' });
    try {
      const result = await operation();

      signal.throwIfAborted();
      const detail = result && typeof result === 'object' ? result : {};

      await session.emit({
        ...base,
        phase: 'finish',
        ...('evidence' in detail ? { evidence: String(detail.evidence) } : {}),
        ...('passed' in detail ? { decision: Boolean(detail.passed) } : {}),
      });

      return result;
    } catch (error) {
      try {
        await session.emit({
          ...base,
          phase: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      } catch (captureError) {
        throw new AggregateError([error, captureError], '步骤失败且证据记录失败');
      }
      throw error;
    }
  }
}
