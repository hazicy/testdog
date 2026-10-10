import { hasPreviewViewers, publishPreview } from '@/server/realtime/preview';
import { join } from 'node:path';
import { EvidenceSink } from './evidenceSink';
import type { AutomationSession, SessionEvent } from '@/automation/platform/contracts';
import { artifactRoot } from './artifactStorage';
import { insertStep, finishStep } from './repository';
import type { TestRun } from '@/features/runs/types';

export class DeviceRecorder {
  private sequence = 0;
  private started = new Map<string, number>();
  private samplePending = false;
  private stopping = false;
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
      this.started.delete(event.id);
    }
  };
  sample(session: AutomationSession) {
    if (this.stopping || this.samplePending || this.started.size) return;
    this.samplePending = true;
    void hasPreviewViewers(this.run.id)
      .then((watching) => (watching ? this.capture(session, 'live') : undefined))
      .catch(() => {})
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
    this.stopping = true;
    await this.captureQueue;
    if (this.captureFailure) throw this.captureFailure;
  }
  capture(
    session: AutomationSession,
    stage: 'before' | 'after' | 'live' | 'final',
    stepId?: string,
  ) {
    const job = this.captureQueue.then(async () => {
      if (stage === 'live') {
        if (this.stopping || this.started.size) return;
        const artifacts = await session.capture({ kind: 'screenshot' }, AbortSignal.timeout(3000));
        const screenshot = artifacts.find((artifact) => artifact.kind === 'screenshot');

        if (screenshot) await publishPreview(this.run.id, screenshot.bytes, screenshot.contentType);

        return;
      }

      await this.evidence.capture(session, { kind: 'screenshot' }, stage, stepId);
      await this.evidence.capture(session, { kind: 'snapshot' }, stage, stepId);
    });

    this.captureQueue = job.catch((error) => {
      if (stage !== 'live') this.captureFailure ??= error;
    });

    return job;
  }
}
