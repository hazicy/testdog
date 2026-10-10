import { join } from 'node:path';
import { EvidenceSink } from './evidenceSink';
import type { AutomationSession, SessionEvent } from '@/automation/platform/contracts';
import { artifactRoot } from './artifactStorage';
import { insertStep, finishStep } from './store';
import type { TestRun } from '../types';

export class DeviceRecorder {
  private sequence = 0;
  private started = new Map<string, number>();
  private samplePending = false;
  private captureFailure?: unknown;
  private captureQueue: Promise<unknown> = Promise.resolve();
  readonly directory: string;
  private evidence: EvidenceSink;
  constructor(private run: TestRun) {
    this.directory = join(artifactRoot(), run.id);
    this.evidence = new EvidenceSink(run);
  }
  onEvent = async (event: SessionEvent, session: AutomationSession) => {
    const surface = {
      platform: session.platform,
      id:
        this.run.targetSnapshot?.platform !== 'web'
          ? (this.run.targetSnapshot?.appId ?? session.id)
          : session.id,
    };
    if (event.phase === 'start') {
      const binding =
        event.action && event.action.platform !== 'web'
          ? await session.resolveForRecording(event.action, session.latestObservation!)
          : undefined;
      const at = Date.now();
      this.started.set(event.id, at);
      await insertStep({
        id: event.id,
        runId: this.run.id,
        sequence: ++this.sequence,
        kind: event.kind,
        title: event.title,
        status: 'running',
        startedAt: new Date(at).toISOString(),
        pageId: surface.id,
        pageUrl: '',
        surface,
        observationRevision: session.revision,
        platformAction: binding ? { ...binding.action, schemaVersion: 1 } : undefined,
        assertion: event.assertion,
        platformAssertion: event.platformAssertion,
        condition: event.condition,
        planNodeId: event.planNodeId,
        replayable: binding?.replayable ?? true,
      });
      await this.capture(session, 'before', event.id);
    } else {
      await finishStep(event.id, {
        status: event.phase === 'error' ? 'failed' : 'passed',
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - (this.started.get(event.id) ?? Date.now()),
        evidence: event.evidence,
        decision: event.decision,
        error: event.error,
      });
      await this.capture(session, 'after', event.id);
    }
  };
  sample(session: AutomationSession) {
    if (this.samplePending) return;
    this.samplePending = true;
    void this.capture(session, 'live')
      .catch((error) => {
        this.captureFailure = error;
      })
      .finally(() => {
        this.samplePending = false;
      });
  }
  async finalizeDiagnostics(session: AutomationSession) {
    const failures: unknown[] = [];
    for (const kind of ['video', 'device-trace', 'log'] as const) {
      if (!session.capabilities.artifacts.includes(kind)) continue;
      try {
        await this.evidence.capture(session, { kind }, 'final');
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, 'Native diagnostics incomplete');
  }
  async drain() {
    await this.captureQueue;
    if (this.captureFailure) throw this.captureFailure;
  }
  capture(
    session: AutomationSession,
    stage: 'before' | 'after' | 'live' | 'final',
    stepId?: string,
  ) {
    const job = this.captureQueue.then(async () => {
      await this.evidence.capture(session, { kind: 'screenshot' }, stage, stepId);
      if (stage !== 'live')
        await this.evidence.capture(session, { kind: 'snapshot' }, stage, stepId);
    });
    this.captureQueue = job.catch((error) => {
      this.captureFailure ??= error;
    });
    return job;
  }
}
