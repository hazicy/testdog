import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AutomationSession, CaptureRequest } from '@/automation/platform/contracts';
import { artifactRoot } from './artifactStorage';
import { insertArtifact } from './repository';
import type { RunArtifact, TestRun } from '@/features/runs/types';
import type { PersistenceQueue } from './persistenceQueue';

// Shared evidence persistence; no driver objects or browser pages cross this boundary.
export class EvidenceSink {
  private failure?: unknown;
  constructor(
    private run: TestRun,
    private persistence?: PersistenceQueue,
  ) {}
  assertComplete() {
    if (this.failure) throw this.failure;
    this.persistence?.assertComplete();
  }
  async capture(
    session: AutomationSession,
    request: CaptureRequest,
    stage: RunArtifact['stage'],
    stepId?: string,
  ) {
    try {
      return await this.captureArtifacts(session, request, stage, stepId);
    } catch (error) {
      this.failure ??= error;
      throw error;
    }
  }
  private async captureArtifacts(
    session: AutomationSession,
    request: CaptureRequest,
    stage: RunArtifact['stage'],
    stepId?: string,
  ) {
    const artifacts = await session.capture(request, AbortSignal.timeout(15000));
    const directory = join(artifactRoot(), this.run.id);

    await mkdir(directory, { recursive: true });
    for (const artifact of artifacts) {
      const id = randomUUID();
      const extension = {
        snapshot: 'json',
        screenshot: 'png',
        video: 'mp4',
        'device-trace': 'ndjson',
        log: 'log',
      }[artifact.kind];
      const path = join(directory, `${id}.${extension}`);

      await writeFile(path, artifact.bytes, { mode: 0o600 });
      const capturedAt = new Date().toISOString();

      const record: RunArtifact = {
        id,
        runId: this.run.id,
        stepId,
        kind: artifact.kind,
        stage,
        pageId: session.latestObservation?.surface.id ?? session.id,
        pageUrl: session.latestObservation?.surface.url ?? '',
        surface: session.latestObservation?.surface ?? {
          platform: session.platform,
          id: session.id,
        },
        capturedAt,
        elapsedMs: Math.max(0, Date.parse(capturedAt) - Date.parse(this.run.startedAt)),
        contentType: artifact.contentType,
        producer: artifact.producer,
        format: artifact.format,
        size: artifact.bytes.length,
      };
      const persist = async () => {
        await insertArtifact(record, path);
      };
      if (this.persistence) await this.persistence.enqueue(persist);
      else await persist();
    }
  }
}
