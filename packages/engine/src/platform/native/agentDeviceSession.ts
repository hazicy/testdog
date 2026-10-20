import { NativeVideoRecorder } from '@testdog/engine/platform/native/nativeVideoRecorder';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PlatformAssertion } from '@testdog/contracts/execution/platform';
import type { CaptureRequest, ArtifactDescriptor } from '@testdog/engine/platform/contracts';
import { clearAndroidData, installedBuildHash } from '@testdog/engine/platform/native/builds';
import { createAgentDeviceClient, type AgentDeviceClient, type SnapshotNode } from 'agent-device';
import {
  NativeActionSchema,
  type CapabilitySet,
  type NativeAction,
  type NativeLocator,
  type Observation,
  type PlatformAction,
  type SessionEvent,
  type ReplayStep,
} from '@testdog/contracts/execution/platform';
import { type AutomationSession } from '@testdog/engine/platform/contracts';
import type { NativeTarget } from '@testdog/contracts/execution/target';

export class AgentDeviceSession implements AutomationSession {
  readonly executionPolicy = { reobserveAfterAction: true };
  readonly platform: NativeTarget['platform'];
  readonly capabilities: CapabilitySet;
  private generation = 0;
  private observation?: Observation;
  private refsGeneration?: number;
  private nodes: SnapshotNode[] = [];
  private viewport?: { width: number; height: number };
  private closing?: Promise<void>;
  private videoRecorder: NativeVideoRecorder;
  private constructor(
    readonly id: string,
    private target: NativeTarget,
    private client: AgentDeviceClient,
    available: string[],
    readonly environment: Record<string, unknown>,
    private onEvent: (event: SessionEvent, session: AgentDeviceSession) => Promise<void>,
  ) {
    const settings = target.evidence || {};
    const enabled = {
      video: settings.video && available.includes('record'),
    };

    if (settings.video && !available.includes('record'))
      throw new Error('Device lacks requested evidence capability: video');
    this.videoRecorder = new NativeVideoRecorder(client, enabled);
    this.platform = target.platform;
    this.capabilities = {
      actions: [
        ['tap', 'press'],
        ['fill', 'fill'],
        ['swipe', 'swipe'],
        ['back', 'back'],
        ['wait', 'snapshot'],
        ['screenshot', 'screenshot'],
      ]
        .filter(([, command]) => available.includes(command))
        .map(([action]) => action),
      artifacts: ['screenshot', ...(enabled.video ? ['video'] : [])],
      assertions: ['semantic', 'visible', 'text', 'value'],
      observations: ['accessibility-nodes', 'viewport', 'app'],
    };
  }
  static async open(
    id: string,
    target: NativeTarget,
    deviceId: string,
    signal: AbortSignal,
    onEvent: (event: SessionEvent, session: AgentDeviceSession) => Promise<void>,
    client = createAgentDeviceClient({ session: id, responseLevel: 'full' }),
    compatibleEnvironment?: Record<string, unknown>,
    resolveBuild?: (
      id: string,
      platform: NativeTarget['platform'],
      appId: string,
    ) => Promise<{ path: string; sha256: string }>,
  ) {
    if (target.buildArtifactId && !resolveBuild)
      throw new Error('Native build resolution requires an injected build repository');
    const build = target.buildArtifactId
      ? await resolveBuild!(target.buildArtifactId, target.platform, target.appId)
      : undefined;

    if (
      (target.resetPolicy === 'reinstall' ||
        (target.resetPolicy === 'clear-data' && target.platform === 'ios')) &&
      !build
    )
      throw new Error('重新安装或清理 iOS 数据需要已登记的构建');
    const selection = target.platform === 'ios' ? { udid: deviceId } : { serial: deviceId };
    const capabilities = await client.devices.capabilities({
      platform: target.platform,
      ...selection,
      signal,
    });

    if (
      compatibleEnvironment &&
      (!compatibleEnvironment.osVersion ||
        compatibleEnvironment.osVersion !== capabilities.device.osVersion ||
        compatibleEnvironment.driverVersion !== '0.21.24')
    )
      throw new Error('设备 OS/driver 与录制不兼容，请重新录制');
    for (const command of ['open', 'snapshot', 'screenshot', 'close'])
      if (!capabilities.availableCommands.includes(command))
        throw new Error(`Device lacks required capability: ${command}`);
    if (capabilities.device.claimedBy && capabilities.device.claimedBy.session !== id)
      throw new Error('设备已被其他会话占用');
    try {
      if (build) {
        const reinstall = target.resetPolicy === 'reinstall' || target.resetPolicy === 'clear-data';
        const command = reinstall ? 'reinstall' : 'install';

        if (!capabilities.availableCommands.includes(command))
          throw new Error(`Device lacks ${command} capability`);
        if (reinstall)
          await client.apps.reinstall({
            app: target.appId,
            appPath: build.path,
            platform: target.platform,
            ...selection,
            signal,
          });
        else
          await client.apps.install({
            app: target.appId,
            appPath: build.path,
            platform: target.platform,
            ...selection,
            signal,
          });
      }

      await client.apps.open({
        platform: target.platform,
        ...selection,
        app: target.appId,
        url: target.launchUrl,
        noRecord: true,
        signal,
        timeoutMs: 120000,
      });
      if (target.resetPolicy === 'clear-data' && target.platform === 'android') {
        await client.apps.close({ signal });
        await clearAndroidData(deviceId, target.appId, signal);
        await client.apps.open({
          platform: target.platform,
          ...selection,
          app: target.appId,
          url: target.launchUrl,
          noRecord: true,
          relaunch: true,
          signal,
        });
      }

      const installedHash =
        capabilities.device.kind === 'device'
          ? build?.sha256
          : await installedBuildHash(target.platform, deviceId, target.appId, signal);
      const session = new AgentDeviceSession(
        id,
        target,
        client,
        capabilities.availableCommands,
        {
          platform: target.platform,
          deviceId: capabilities.device.id,
          osVersion: capabilities.device.osVersion,
          deviceName: capabilities.device.name,
          driverVersion: '0.21.24',
          sdkCommands: capabilities.availableCommands,
          ...(installedHash ? { buildSha256: installedHash } : {}),
        },
        onEvent,
      );

      await session.videoRecorder.start(signal);

      return session;
    } catch (error) {
      try {
        await client.sessions.close({ signal: AbortSignal.timeout(30000) });
      } catch (cleanupError) {
        throw new Error(
          `原生准备失败且会话清理未确认：${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          { cause: error },
        );
      }

      throw error;
    }
  }

  get latestObservation() {
    return this.observation;
  }
  get revision() {
    return this.generation;
  }
  async observe(signal: AbortSignal): Promise<Observation> {
    this.assertOpen();
    const result = await this.client.capture.snapshot({
      signal,
      timeoutMs: this.generation === 0 ? 90000 : 15000,
    });

    this.nodes = result.nodes;
    this.refsGeneration = result.refsGeneration;
    this.viewport = result.viewport;
    this.generation++;

    return (this.observation = {
      schemaVersion: 1,
      sessionId: this.id,
      revision: this.revision,
      capturedAt: new Date().toISOString(),
      surface: { platform: this.platform, id: this.target.appId, appId: this.target.appId },
      nodes: result.nodes.map((node) =>
        node.password ? { ...node, value: '[redacted]', label: '[secure input]' } : node,
      ),
      viewport: result.viewport,
    });
  }
  resolve(target: NativeLocator): SnapshotNode {
    if (target.kind === 'ref' && target.revision !== this.revision)
      throw new Error('Stale device ref: observe again');
    const nodes = this.nodes.filter((node) =>
      target.kind === 'ref'
        ? node.ref === target.value
        : target.kind === 'identifier'
          ? node.identifier === target.value
          : node.label === target.value && (!target.role || node.role === target.role),
    );

    if (nodes.length !== 1)
      throw new Error(`Device locator must resolve uniquely, found ${nodes.length}`);

    return nodes[0];
  }
  binding(action: NativeAction): { action: NativeAction; replayable: boolean } {
    if (!('target' in action)) return { action, replayable: action.type !== 'swipe' };
    const node = this.resolve(action.target);
    const candidates: NativeLocator[] = [];

    if (node.identifier) candidates.push({ kind: 'identifier', value: node.identifier });
    if (node.label && !node.password)
      candidates.push({
        kind: 'label',
        value: node.label,
        ...(node.role ? { role: node.role } : {}),
      });
    for (const target of candidates) {
      try {
        if (this.resolve(target) === node)
          return { action: { ...action, target }, replayable: true };
      } catch {
        /* Try the next binding. */
      }
    }

    return { action, replayable: false };
  }
  async prepareReplayStep(step: ReplayStep, signal: AbortSignal) {
    this.assertOpen();
    signal.throwIfAborted();
    if (step.event.action && step.event.action.platform !== this.platform)
      throw new Error('Platform mismatch');
    // Native runs stay attached to their leased device and app; there are no browser tabs to select.
  }
  async perform(supplied: PlatformAction, signal: AbortSignal) {
    this.assertOpen();
    if (supplied.platform !== this.platform) throw new Error('Platform mismatch');
    const action = NativeActionSchema.parse(supplied.action);

    if (!this.capabilities.actions.includes(action.type))
      throw new Error(`Unsupported action: ${action.type}`);
    if (action.type === 'screenshot') {
      await this.capture({ kind: 'screenshot' }, signal);

      return;
    }

    if (action.type === 'wait') {
      const deadline = Date.now() + action.timeoutMs;

      do {
        await this.observe(signal);
        if (
          this.nodes.some(
            (node) =>
              node.label?.includes(action.text) ||
              (!node.password && node.value?.includes(action.text)),
          )
        )
          return;
        await new Promise<void>((resolve, reject) => {
          const stop = () => {
            clearTimeout(timer);
            reject(signal.reason);
          };

          const timer = setTimeout(() => {
            signal.removeEventListener('abort', stop);
            resolve();
          }, 100);

          signal.addEventListener('abort', stop, { once: true });
          if (signal.aborted) stop();
        });
      } while (Date.now() < deadline);

      throw new Error(`Native wait timed out after ${action.timeoutMs}ms`);
    }

    try {
      if (action.type === 'tap' || action.type === 'fill') {
        const node = this.resolve(action.target);

        if (!node.ref) throw new Error('Target has no actionable ref');
        const token = node.ref.startsWith('@') ? node.ref : `@${node.ref}`;
        const ref = this.refsGeneration === undefined ? token : `${token}~s${this.refsGeneration}`;

        if (action.type === 'tap')
          await this.client.interactions.press({ ref, signal, settle: true, timeoutMs: 15000 });
        else {
          await this.client.interactions.fill({
            ref,
            text: action.value,
            signal,
            settle: true,
            timeoutMs: 15000,
          });
        }
      } else if (action.type === 'back') {
        await this.client.command.back({ signal, settle: true, timeoutMs: 15000 });
      } else {
        if (!this.viewport) throw new Error('Device viewport unavailable');
        const { width, height } = this.viewport;
        const horizontal = ['left', 'right'].includes(action.direction);
        const reverse = ['down', 'right'].includes(action.direction);
        const from = {
          x: horizontal ? width * (reverse ? 0.2 : 0.8) : width / 2,
          y: horizontal ? height / 2 : height * (reverse ? 0.2 : 0.8),
        };
        const to = {
          x: horizontal ? width - from.x : from.x,
          y: horizontal ? from.y : height - from.y,
        };

        await this.client.interactions.swipe({ from, to, signal });
      }
    } finally {
      // A failed device command may still have changed the UI.
      this.generation++;
      this.nodes = [];
      this.observation = undefined;
    }
  }
  async wait(action: PlatformAction, signal: AbortSignal) {
    if (action.action.type !== 'wait') throw new Error('Expected wait action');
    await this.perform(action, signal);

    return this.observe(signal);
  }
  async check(assertion: PlatformAssertion, signal: AbortSignal) {
    if (assertion.platform !== this.platform) throw new Error('Assertion platform mismatch');
    await this.observe(signal);
    try {
      const node = this.resolve(assertion.target);
      const actual =
        assertion.type === 'value' ? (node.password ? undefined : node.value) : node.label;
      const passed =
        assertion.type === 'visible'
          ? node.visibleToUser === true || node.hittable === true
          : assertion.value !== undefined && actual === assertion.value;

      return {
        passed,
        evidence: JSON.stringify({
          identifier: node.identifier,
          type: assertion.type,
          actual,
          visibleToUser: node.visibleToUser,
          hittable: node.hittable,
        }),
      };
    } catch (error) {
      return { passed: false, evidence: error instanceof Error ? error.message : String(error) };
    }
  }
  async resolveForRecording(action: PlatformAction, observation: Observation) {
    if (
      action.platform === 'web' ||
      action.platform !== this.platform ||
      observation.sessionId !== this.id ||
      observation.revision !== this.revision
    )
      throw new Error('Recording observation mismatch');
    const bound = this.binding(action.action);

    return {
      action: { platform: this.platform, action: bound.action },
      replayable: bound.replayable,
    };
  }
  async capture(request: CaptureRequest, signal: AbortSignal): Promise<ArtifactDescriptor[]> {
    this.assertOpen();
    if (request.kind !== 'screenshot') return this.videoRecorder.capture(request, signal);
    const directory = await mkdtemp(join(tmpdir(), 'testdog-capture-'));

    try {
      const path = join(directory, 'capture.png');

      await this.screenshot(path, signal);

      return [
        {
          kind: 'screenshot',
          bytes: await readFile(path),
          contentType: 'image/png',
          producer: 'agent-device',
          format: 'png',
        },
      ];
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  emit(event: SessionEvent) {
    return this.onEvent(event, this);
  }
  async screenshot(path: string, signal: AbortSignal) {
    this.assertOpen();

    return this.client.capture.screenshot({ path, signal });
  }
  get safeToRelease() {
    return this.videoRecorder.safeToRelease;
  }
  private assertOpen() {
    if (this.closing) throw new Error('Native session is closing or closed');
  }
  close() {
    return (this.closing ??= this.closeSession());
  }
  private async closeSession() {
    const failures: unknown[] = [];

    try {
      await this.videoRecorder.stop(AbortSignal.timeout(20000));
    } catch (error) {
      failures.push(error);
    }

    try {
      await this.client.sessions.close({ signal: AbortSignal.timeout(30000) });
      await this.videoRecorder.cleanup();
    } catch (error) {
      failures.push(error);
    }

    if (failures.length) throw new AggregateError(failures, 'Native session cleanup failed');
  }
}
