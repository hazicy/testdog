import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import type { AgentDeviceClient } from 'agent-device';
import type { ArtifactDescriptor, CaptureRequest } from '@testdog/engine/platform/contracts';

export class NativeVideoRecorder {
  private directory?: string;
  private video = false;
  private exported = new Map<string, ArtifactDescriptor[]>();
  private exporting = new Map<string, Promise<ArtifactDescriptor[]>>();
  safeToRelease = true;
  constructor(
    private client: AgentDeviceClient,
    private enabled: { video?: boolean },
  ) {}
  async start(signal: AbortSignal) {
    if (!this.enabled.video) return;
    this.directory = await mkdtemp(join(tmpdir(), 'testdog-device-evidence-'));
    await this.client.recording.record({
      action: 'start',
      path: join(this.directory, 'video.mp4'),
      hideTouches: true,
      signal,
    });
    this.video = true;
  }
  private async ownedFile(path: string, root: string) {
    const resolved = await realpath(path);
    const inside = relative(await realpath(root), resolved);

    if (!inside || inside.startsWith('..') || isAbsolute(inside))
      throw new Error('Video path escaped its session directory');

    return readFile(resolved);
  }
  async capture(request: CaptureRequest, signal: AbortSignal): Promise<ArtifactDescriptor[]> {
    const pending = this.exporting.get(request.kind);

    if (pending) return pending;
    const job = this.captureArtifacts(request, signal)
      .catch((error) => {
        if (this.video) this.safeToRelease = false;
        throw error;
      })
      .finally(() => this.exporting.delete(request.kind));

    this.exporting.set(request.kind, job);

    return job;
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
    }

    this.exported.set(request.kind, result);

    return result;
  }
  async stop(signal: AbortSignal) {
    await this.capture({ kind: 'video' }, signal);
  }
  async cleanup() {
    // Never delete a native recorder path whose writer termination is uncertain.
    if (this.directory && this.safeToRelease && !this.video)
      await rm(this.directory, { recursive: true, force: true });
  }
}
