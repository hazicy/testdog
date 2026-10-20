import { randomUUID } from 'node:crypto';
import { ReplanRequiredError } from '@testdog/engine/replanning';
import { ExecutablePlanSchema, type PlanNode } from '@testdog/contracts/execution/plan';
import {
  PlatformActionSchema,
  ObservationSchema,
  CapabilitySetSchema,
  PlatformAssertionSchema,
  type PlatformAction,
  type SessionEvent,
  type ReplayStep,
  type Observation,
} from '@testdog/contracts/execution/platform';
import {
  type CheckResult,
  type RunnerOptions,
  type ActionPlanner,
  type ObservationRequest,
} from '@testdog/engine/platform/contracts';

// Owns business sequencing only. Driver objects and evidence capture belong to sessions.
export class PlanRunner {
  private nodeId?: string;
  constructor(private options: RunnerOptions) {
    CapabilitySetSchema.parse(options.session.capabilities);
  }

  private async observe(request?: ObservationRequest) {
    const { session, signal } = this.options;
    const observation = ObservationSchema.parse(await session.observe(signal, request));

    if (
      observation.sessionId !== session.id ||
      observation.surface.platform !== session.platform ||
      observation.revision !== session.revision
    )
      throw new Error('Observation session/revision mismatch');

    return observation;
  }

  async record(initial?: PlatformAction) {
    this.options.plan = ExecutablePlanSchema.parse(this.options.plan);
    if (initial) await this.action(initial);
    await this.visit(this.options.plan.rootId, new Set(), new Set());
    await this.options.session.verifyPlugins?.(this.options.signal);
  }

  async replay(steps: ReplayStep[]) {
    for (const step of steps) await this.replayStep(step);
    await this.options.session.verifyPlugins?.(this.options.signal);
  }

  private async replayStep(step: ReplayStep) {
    const { session, signal } = this.options;
    const { event } = step;

    this.nodeId = event.planNodeId;
    signal.throwIfAborted();
    await session.prepareReplayStep(step, signal);
    if (event.action) {
      const isPlugin = event.action.action.type === 'plugin';

      if (!isPlugin) await this.observe();
      await this.action(event.action, isPlugin ? { title: event.title } : {});

      return;
    }

    if (event.platformAssertion) {
      const assertion = PlatformAssertionSchema.parse(event.platformAssertion);

      if (
        assertion.platform !== session.platform ||
        !session.capabilities.assertions.includes(assertion.type)
      )
        throw new Error('Unsupported platform assertion');
      await this.traced(event, async () => {
        const result = await session.check(assertion, signal);

        return this.verify(result, true);
      });

      return;
    }

    if (event.assertion || event.condition) {
      const isAssertion = Boolean(event.assertion);

      await this.traced(event, () =>
        this.evaluateAndVerify(
          isAssertion ? { assertion: event.assertion } : { condition: event.condition },
          isAssertion ? 'assertion_result' : 'branch_result',
          isAssertion ? true : event.decision,
        ),
      );

      return;
    }

    throw new Error(`Missing replay content: ${event.title}`);
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
      } else await this.executeTask(node);

      completed.add(id);
    } finally {
      visiting.delete(id);
    }
  }

  private async executeTask(node: Extract<PlanNode, { kind: 'task' }>) {
    await this.options.report?.(`执行任务：${node.goal}`);
    switch (node.actionType) {
      case 'plugin':
        if (!node.plugin) throw new Error('请配置插件');
        await this.action(
          { platform: 'web', action: { type: 'plugin', plugin: node.plugin } },
          { title: node.goal },
        );
        break;
      case 'navigate':
        if (this.options.session.platform !== 'web')
          throw new Error('Navigate 步骤仅支持 Web 测试');
        await this.action({
          platform: 'web',
          action: {
            type: 'navigate',
            target: { kind: 'css', value: '', name: '' },
            value: node.goal.trim(),
          },
        });
        break;
      case 'screenshot': {
        await this.observe();
        const platform = this.options.session.platform;

        await this.action(
          platform === 'web'
            ? {
                platform,
                action: {
                  type: 'screenshot',
                  target: { kind: 'css', value: '', name: '' },
                  value: '',
                },
              }
            : { platform, action: { type: 'screenshot' } },
        );
        break;
      }

      case 'assert':
        break;
      default:
        await this.task(node);
    }

    for (const assertion of node.assertions) {
      await this.traced({ kind: 'assertion', title: assertion.description, assertion }, () =>
        this.evaluateAndVerify({ assertion }, 'assertion_result', true),
      );
    }
  }

  private async task(node: Extract<PlanNode, { kind: 'task' }>) {
    const { session, planner, signal } = this.options;
    const completedSteps: PlatformAction[] = [];
    const completedObservations: Observation[] = [];
    let remainingWaitMs = 15000;
    let count = 0;
    let replans = 0;
    let previousFailure: Parameters<ActionPlanner['plan']>[0]['previousFailure'];
    let observationRequest: ObservationRequest | undefined;
    const recover = (error: unknown, action?: PlatformAction) => {
      signal.throwIfAborted();
      if (!(error instanceof ReplanRequiredError) || replans >= 2) throw error;
      replans++;
      previousFailure = { reason: error.message, ...(action ? { action } : {}) };
    };

    while (true) {
      signal.throwIfAborted();
      const observation = await this.observe(observationRequest);

      observationRequest = undefined;
      const revision = session.revision;
      let decision: Awaited<ReturnType<ActionPlanner['plan']>>;

      try {
        decision = await planner.plan({
          goal: node.goal,
          observation,
          capabilities: session.capabilities,
          completedSteps: [...completedSteps],
          completedObservations: [...completedObservations],
          remainingWaitMs,
          ...(previousFailure ? { previousFailure } : {}),
        });
      } catch (error) {
        recover(error);
        continue;
      }

      signal.throwIfAborted();
      if (revision !== session.revision) continue;
      if (decision.observe) {
        if (decision.done || decision.steps.length)
          throw new Error('Region observation must not be combined with actions or completion');
        if (!session.capabilities.observations?.includes('regions'))
          throw new Error('Session does not support region observations');
        if (++count > 20) throw new Error(`Exceeded 20 actions: ${node.goal}`);
        observationRequest = decision.observe;
        continue;
      }

      if (decision.done) return;
      if (!decision.steps.length) throw new Error('Planner returned no actions');
      for (const [index, supplied] of decision.steps.entries()) {
        const step = PlatformActionSchema.parse(supplied);

        if (step.action.type === 'wait') {
          if (remainingWaitMs <= 0) throw new Error(`Wait budget exceeded: ${node.goal}`);
          const budget = Math.min(step.action.timeoutMs, remainingWaitMs);

          remainingWaitMs -= budget;
          step.action.timeoutMs = budget;
        } else if (++count > 20) throw new Error(`Exceeded 20 actions: ${node.goal}`);
        try {
          await this.action(step, {
            modelCallId: decision.modelCallId,
            toolCallId: decision.toolCallIds?.[index],
          });
        } catch (error) {
          recover(error, step);
          break;
        }

        previousFailure = undefined;
        completedSteps.push(step);
        completedObservations.push(observation);
        // The session owns whether dispatched actions require a fresh observation.
        if (session.executionPolicy.reobserveAfterAction || revision !== session.revision) break;
      }
    }
  }

  private action(
    action: PlatformAction,
    source: Pick<SessionEvent, 'modelCallId' | 'toolCallId'> & { title?: string } = {},
  ) {
    action = PlatformActionSchema.parse(action);
    const { session, signal } = this.options;

    if (
      action.platform !== session.platform ||
      !session.capabilities.actions.includes(action.action.type)
    )
      throw new Error(`Unsupported ${action.platform} action: ${action.action.type}`);

    const type = action.action.type;

    return this.traced(
      {
        kind: type === 'navigate' || type === 'wait' ? type : 'action',
        title: type,
        action,
        ...source,
      },
      () => session.perform(action, signal),
    );
  }

  private verify(result: CheckResult, expected: boolean | undefined): CheckResult {
    if (result.passed !== expected)
      throw Object.assign(new Error(result.evidence), { modelCallId: result.modelCallId });

    return result;
  }

  private async evaluateAndVerify(
    subject: Record<string, unknown>,
    name: string,
    expected: boolean | undefined,
  ) {
    return this.verify(await this.evaluate(subject, name), expected);
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

      const detail = result && typeof result === 'object' ? result : {};

      if ('modelCallId' in detail && typeof detail.modelCallId === 'string')
        base.modelCallId = detail.modelCallId;

      signal.throwIfAborted();

      await session.emit({
        ...base,
        phase: 'finish',
        ...('evidence' in detail ? { evidence: String(detail.evidence) } : {}),
        ...('passed' in detail ? { decision: Boolean(detail.passed) } : {}),
      });

      return result;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'modelCallId' in error &&
        typeof error.modelCallId === 'string'
      )
        base.modelCallId = error.modelCallId;
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
