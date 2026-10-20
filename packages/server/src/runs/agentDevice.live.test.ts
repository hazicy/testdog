import { normalizeReplaySteps } from '@testdog/contracts/runs/lib/replay';
import { SemanticEvaluator } from '@testdog/engine/evaluator';
import { deepseekClient } from '@testdog/engine/llm/deepseek';
import { PlanRunner } from '@testdog/engine/planRunner';
import type { RecordingOperation } from '@testdog/contracts/runs/types';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, afterAll, vi } from 'vitest';

const isolated = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
}));

vi.mock('@testdog/server/db', async (original) => {
  if (process.env.RUN_DEVICE_LIVE_TESTS !== 'true')
    return original<typeof import('@testdog/server/db')>();
  const result = await (await import('@testdog/server/testing/testDatabase')).createTestDatabase();

  isolated.client = result.client;

  return { db: result.db };
});
import { getBuild, registerBuild } from '@testdog/server/builds/repository';

afterAll(() => isolated.client?.close());
import { AgentDeviceSession } from '@testdog/engine/platform/native/agentDeviceSession';
import type { NativeAction, PlatformAction } from '@testdog/contracts/execution/platform';

const exec = promisify(execFile);
const live = process.env.RUN_DEVICE_LIVE_TESTS === 'true';

async function replayThroughRunner(
  session: AgentDeviceSession,
  bindings: PlatformAction[],
  signal: AbortSignal,
) {
  const steps: RecordingOperation[] = bindings.map((action) => ({
    kind: action.action.type === 'wait' ? 'wait' : 'action',
    title: action.action.type,
    pageId: 'app',
    action,
  }));

  steps.push({
    kind: 'assertion',
    title: 'Welcome Ada',
    pageId: 'app',
    platformAssertion: {
      platform: session.platform,
      type: 'text',
      target: { kind: 'label', value: 'Welcome Ada' },
      value: 'Welcome Ada',
    },
  });
  await new PlanRunner({
    session,
    evaluator: new SemanticEvaluator(deepseekClient),
    signal,
    plan: { rootId: '', nodes: {} },
    planner: {
      plan: async () => {
        throw new Error('Replay must never replan actions');
      },
    },
  }).replay(normalizeReplaySteps(steps));
}

it.skipIf(!live || process.platform !== 'darwin')(
  'runs an installed UIKit fixture through agent-device and replays stable bindings',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'testdog-ios-'));

    vi.stubEnv('TESTDOG_DATA_DIR', directory);
    let udid: string | undefined;
    let session: AgentDeviceSession | undefined;
    const signal = AbortSignal.timeout(240000);
    const app = join(directory, 'TestdogFixture.app');

    try {
      await mkdir(app);
      await cp(
        'packages/engine/src/platform/native/fixtures/ios/Info.plist',
        join(app, 'Info.plist'),
      );
      const sdk = (
        await exec('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'])
      ).stdout.trim();

      await exec(
        'xcrun',
        [
          '--sdk',
          'iphonesimulator',
          'swiftc',
          '-sdk',
          sdk,
          '-target',
          `${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-ios17.0-simulator`,
          '-parse-as-library',
          'packages/engine/src/platform/native/fixtures/ios/Main.swift',
          '-o',
          join(app, 'TestdogFixture'),
        ],
        { timeout: 120000 },
      );
      const runtimeData = JSON.parse(
        (await exec('xcrun', ['simctl', 'list', 'runtimes', '-j'])).stdout,
      );
      const runtime = runtimeData.runtimes.find(
        (r: { identifier: string; isAvailable: boolean }) =>
          r.isAvailable && r.identifier.includes('.iOS-'),
      );

      if (!runtime) throw new Error('No installed iOS runtime');
      udid = (
        await exec('xcrun', [
          'simctl',
          'create',
          `Testdog validation ${Date.now()}`,
          'com.apple.CoreSimulator.SimDeviceType.iPhone-17',
          runtime.identifier,
        ])
      ).stdout.trim();
      await exec('xcrun', ['simctl', 'boot', udid]);
      await exec('xcrun', ['simctl', 'bootstatus', udid, '-b'], { timeout: 120000 });
      const build = await registerBuild('ios', app);
      const target = {
        schemaVersion: 1,
        platform: 'ios',
        buildArtifactId: build.id,
        appId: 'com.testdog.fixture',
        deviceProfileId: 'fixture',
        resetPolicy: 'preserve',
      } as const;

      session = await AgentDeviceSession.open(
        `testdog-fixture-${Date.now()}`,
        target,
        udid,
        signal,
        async () => {},
        undefined,
        undefined,
        getBuild,
      );
      const commands: NativeAction[] = [
        { type: 'fill', target: { kind: 'identifier', value: 'fixture-name' }, value: 'Ada' },
        { type: 'tap', target: { kind: 'identifier', value: 'fixture-submit' } },
        { type: 'wait', text: 'Welcome Ada', timeoutMs: 5000 },
      ];
      const bindings: PlatformAction[] = [];

      for (const action of commands) {
        await session.observe(signal);
        const binding = session.binding(action);

        expect(binding.replayable).toBe(true);
        bindings.push({ platform: 'ios', action: binding.action });
        await session.perform({ platform: 'ios', action }, signal);
      }

      const observed = await session.observe(signal);

      expect(JSON.stringify(observed)).toContain('Welcome Ada');
      const path = join(directory, 'result.png');

      await session.screenshot(path, signal);
      expect((await readFile(path)).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      await session.close();
      session = await AgentDeviceSession.open(
        `testdog-replay-${Date.now()}`,
        { ...target, resetPolicy: 'clear-data' },
        udid,
        signal,
        async () => {},
        undefined,
        undefined,
        getBuild,
      );
      expect(JSON.stringify(await session.observe(signal))).not.toContain('Welcome Ada');
      await replayThroughRunner(session, bindings, signal);
      expect(JSON.stringify(await session.observe(signal))).toContain('Welcome Ada');
      await session.close();
      await session.close();
    } finally {
      await session?.close().catch(() => {});
      if (udid) {
        await exec('xcrun', ['simctl', 'shutdown', udid]).catch(() => {});
        await exec('xcrun', ['simctl', 'delete', udid]).catch(() => {});
      }

      await rm(directory, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  },
  300000,
);

it.skipIf(!live || !process.env.TESTDOG_ANDROID_SERIAL)(
  'runs an Android fixture through agent-device and replays stable bindings',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'testdog-android-'));

    vi.stubEnv('TESTDOG_DATA_DIR', directory);
    const sdk = process.env.ANDROID_SDK_ROOT || join(process.env.HOME!, 'Library/Android/sdk');
    const java =
      process.env.TESTDOG_JAVA_HOME ||
      '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
    const tools = join(sdk, 'build-tools', '36.0.0');
    const androidJar = join(sdk, 'platforms', 'android-36', 'android.jar');
    const serial = process.env.TESTDOG_ANDROID_SERIAL!;
    const adb = join(sdk, 'platform-tools', 'adb');
    const signal = AbortSignal.timeout(180000);
    let session: AgentDeviceSession | undefined;

    try {
      const classes = join(directory, 'classes');

      await mkdir(classes);
      const apk = join(directory, 'fixture.apk');
      const resources = join(directory, 'resources.zip');
      const env = {
        ...process.env,
        JAVA_HOME: java,
        PATH: `${join(java, 'bin')}:${process.env.PATH}`,
      };

      await exec(join(tools, 'aapt2'), [
        'compile',
        '--dir',
        'packages/engine/src/platform/native/fixtures/android/res',
        '-o',
        resources,
      ]);
      await exec(join(tools, 'aapt2'), [
        'link',
        '-o',
        apk,
        '-I',
        androidJar,
        '--manifest',
        'packages/engine/src/platform/native/fixtures/android/AndroidManifest.xml',
        resources,
      ]);
      await exec(join(java, 'bin', 'javac'), [
        '-source',
        '17',
        '-target',
        '17',
        '-classpath',
        androidJar,
        '-d',
        classes,
        'packages/engine/src/platform/native/fixtures/android/MainActivity.java',
      ]);
      await exec(
        join(tools, 'd8'),
        [
          '--lib',
          androidJar,
          '--output',
          directory,
          join(classes, 'com/testdog/fixture/MainActivity.class'),
        ],
        { env },
      );
      await exec(join(tools, 'aapt'), ['add', apk, 'classes.dex'], { cwd: directory });
      const key = join(directory, 'fixture.keystore');

      await exec(join(java, 'bin', 'keytool'), [
        '-genkeypair',
        '-keystore',
        key,
        '-storepass',
        'fixture-only',
        '-keypass',
        'fixture-only',
        '-alias',
        'fixture',
        '-keyalg',
        'RSA',
        '-dname',
        'CN=Testdog Fixture',
        '-validity',
        '1',
      ]);
      await exec(
        join(tools, 'apksigner'),
        ['sign', '--ks', key, '--ks-pass', 'pass:fixture-only', apk],
        { env },
      );
      const build = await registerBuild('android', apk);
      const target = {
        schemaVersion: 1,
        platform: 'android',
        buildArtifactId: build.id,
        appId: 'com.testdog.fixture',
        deviceProfileId: 'fixture',
        resetPolicy: 'preserve',
      } as const;

      session = await AgentDeviceSession.open(
        `testdog-android-${Date.now()}`,
        target,
        serial,
        signal,
        async () => {},
        undefined,
        undefined,
        getBuild,
      );
      const commands: NativeAction[] = [
        {
          type: 'fill',
          target: { kind: 'identifier', value: 'com.testdog.fixture:id/fixture_name' },
          value: 'Ada',
        },
        {
          type: 'tap',
          target: { kind: 'identifier', value: 'com.testdog.fixture:id/fixture_submit' },
        },
        { type: 'wait', text: 'Welcome Ada', timeoutMs: 5000 },
      ];
      const bindings: PlatformAction[] = [];

      for (const action of commands) {
        await session.observe(signal);
        const binding = session.binding(action);

        expect(binding.replayable).toBe(true);
        bindings.push({ platform: 'android', action: binding.action });
        await session.perform({ platform: 'android', action }, signal);
      }

      expect(JSON.stringify(await session.observe(signal))).toContain('Welcome Ada');
      const path = join(directory, 'result.png');

      await session.screenshot(path, signal);
      expect((await readFile(path)).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      await session.close();
      session = await AgentDeviceSession.open(
        `testdog-android-replay-${Date.now()}`,
        { ...target, resetPolicy: 'clear-data' },
        serial,
        signal,
        async () => {},
        undefined,
        undefined,
        getBuild,
      );
      expect(JSON.stringify(await session.observe(signal))).not.toContain('Welcome Ada');
      await replayThroughRunner(session, bindings, signal);
      expect(JSON.stringify(await session.observe(signal))).toContain('Welcome Ada');
      const supported = session.environment.sdkCommands as string[];
      const evidence = {
        video: supported.includes('record'),
      };

      await session.close();
      session = await AgentDeviceSession.open(
        `testdog-android-reinstall-${Date.now()}`,
        { ...target, resetPolicy: 'reinstall', evidence },
        serial,
        signal,
        async () => {},
        undefined,
        undefined,
        getBuild,
      );
      expect(JSON.stringify(await session.observe(signal))).not.toContain('Welcome Ada');
      for (const kind of ['video'] as const) {
        if (!session.capabilities.artifacts.includes(kind)) continue;
        const artifacts = await session.capture({ kind }, signal);

        expect(artifacts).toHaveLength(1);
        expect(artifacts[0].producer).toContain('agent-device');
        if (kind === 'video')
          expect(Buffer.from(artifacts[0].bytes).subarray(4, 8).toString()).toBe('ftyp');
      }

      expect(session.safeToRelease).toBe(true);
    } finally {
      await session?.close().catch(() => {});
      await exec(adb, ['-s', serial, 'uninstall', 'com.testdog.fixture']).catch(() => {});
      await rm(directory, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  },
  240000,
);
