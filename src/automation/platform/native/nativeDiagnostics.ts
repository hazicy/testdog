import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import type { AgentDeviceClient } from 'agent-device';
import type { ArtifactDescriptor, CaptureRequest } from '../contracts';

export type NativeEvidence = { video?: boolean; trace?: boolean; logs?: boolean };
export class NativeDiagnostics {
  private directory?: string;
  private video = false;
  private trace = false;
  private logs = false;
  private exported = new Map<string, ArtifactDescriptor[]>();
  safeToRelease = true;
  constructor(
    private client: AgentDeviceClient,
    private id: string,
    private enabled: NativeEvidence,
  ) {}
  async start(signal: AbortSignal) {
    if (!Object.values(this.enabled).some(Boolean)) return;
    this.directory = await mkdtemp(join(tmpdir(), 'caseforge-device-evidence-'));
    if (this.enabled.video) {
      await this.client.recording.record({
        action: 'start',
        path: join(this.directory, 'video.mp4'),
        hideTouches: true,
        signal,
      });
      this.video = true;
    }
    if (this.enabled.trace) {
      await this.client.recording.trace({
        action: 'start',
        path: join(this.directory, 'trace.ndjson'),
        signal,
      });
      this.trace = true;
    }
    if (this.enabled.logs) {
      await this.client.observability.logs({ action: 'start', signal });
      this.logs = true;
    }
  }
  private async ownedFile(path: string, root: string) {
    const resolved = await realpath(path);
    const inside = relative(await realpath(root), resolved);
    if (!inside || inside.startsWith('..') || isAbsolute(inside))
      throw new Error('Diagnostic path escaped its session directory');

    return readFile(resolved);
  }
  async capture(request: CaptureRequest, signal: AbortSignal): Promise<ArtifactDescriptor[]> {
    try {
      return await this.captureArtifacts(request, signal);
    } catch (error) {
      if (this.video || this.trace || this.logs) this.safeToRelease = false;
      throw error;
    }
  }
  private async captureArtifacts(
    request: CaptureRequest,
    signal: AbortSignal,
  ): Promise<ArtifactDescriptor[]> {
    if (this.exported.has(request.kind)) return this.exported.get(request.kind)!;
    let result: ArtifactDescriptor[] = [];
    if (request.kind === 'video' && this.video) {
      const stopped = await this.client.recording.record({ action: 'stop', signal });
      if (
        stopped.recording !== 'stopped' ||
        stopped.recorder !== 'confirmed' ||
        stopped.nativePathDisposition === 'pending'
      ) {
        this.safeToRelease = false;
        throw new Error('Native recorder termination is unconfirmed; keep resource quarantined');
      }
      this.video = false;
      result = [
        {
          kind: 'video',
          bytes: await this.ownedFile(stopped.outPath, this.directory!),
          contentType: 'video/mp4',
          producer: 'agent-device',
          format: 'mp4',
        },
      ];
    } else if (request.kind === 'device-trace' && this.trace) {
      const stopped = await this.client.recording.trace({ action: 'stop', signal });
      if (stopped.trace !== 'stopped') throw new Error('Native trace did not stop');
      this.trace = false;
      result = [
        {
          kind: 'device-trace',
          bytes: await this.ownedFile(stopped.outPath, this.directory!),
          contentType: 'application/x-ndjson',
          producer: 'agent-device',
          format: 'agent-device-trace-v1',
        },
      ];
    } else if (request.kind === 'log' && this.logs) {
      await this.client.observability.logs({ action: 'stop', signal });
      this.logs = false;
      const pathResult = await this.client.observability.logs({ action: 'path', signal });
      const sessions = await this.client.sessions.list({ signal });
      const session = sessions.find(
        (session) => session.name === this.id || session.address === this.id,
      );
      if (!session?.sessionStateDir || typeof pathResult.path !== 'string')
        throw new Error('App log path is unavailable for this named session');
      result = [
        {
          kind: 'log',
          bytes: await this.ownedFile(pathResult.path, session.sessionStateDir),
          contentType: 'text/plain',
          producer: 'agent-device-app',
          format: 'log',
        },
      ];
    }
    this.exported.set(request.kind, result);

    return result;
  }
  async stop(signal: AbortSignal) {
    const failures: unknown[] = [];
    for (const kind of ['video', 'device-trace', 'log'] as const) {
      try {
        await this.capture({ kind }, signal);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, 'Native diagnostics did not finalize');
  }
  async cleanup() {
    // Never delete a native recorder path whose writer termination is uncertain.
    if (this.directory && this.safeToRelease && !this.video && !this.trace && !this.logs)
      await rm(this.directory, { recursive: true, force: true });
  }
}
