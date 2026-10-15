import type { PlatformRuntime, RuntimeInput } from '@testdog/server/runs/runtimeTypes';
import { RuntimeOpenError } from '@testdog/server/runs/runtimeTypes';
import { modelClient } from '@testdog/server/shared/model';
import { SemanticEvaluator } from '@testdog/automation/evaluator';
import { AgentDeviceSession } from '@testdog/automation/platform/native/agentDeviceSession';
import { NativeActionPlanner } from '@testdog/automation/platform/native/nativePlanner';
import { DeviceRecorder } from '@testdog/server/runs/deviceRecorder';
import { getBuild } from '@testdog/server/builds/repository';
import { previewInterval } from '@testdog/server/realtime/preview';
import { finalizeRuntime } from '@testdog/server/runs/finalizeRuntime';
import type { NativeTarget } from '@testdog/contracts/automation/platform/target';

export async function openNativeRuntime(
  input: RuntimeInput,
  target: NativeTarget,
): Promise<PlatformRuntime> {
  const { run, expectedEnvironment, resource, signal } = input;
  const model = input.model ?? modelClient;

  if (!resource?.deviceId) throw new Error('设备租约没有绑定设备 ID');
  const recorder = new DeviceRecorder(run);
  const session = await AgentDeviceSession.open(
    `${run.id}-${run.attempt ?? 1}`,
    target,
    resource.deviceId,
    signal,
    recorder.onEvent,
    undefined,
    expectedEnvironment,
    getBuild,
  ).catch((error) => {
    throw new RuntimeOpenError(error, false);
  });
  let live: ReturnType<typeof setInterval> | undefined;
  let closing: Promise<void> | undefined;
  const runtime: PlatformRuntime = {
    session,
    evaluator: new SemanticEvaluator(model),
    planner: new NativeActionPlanner(model, target.platform, signal),
    environment: session.environment,
    healthy: false,
    cleanup() {
      clearInterval(live);

      return (closing ??= session.close().then(() => {
        runtime.healthy = session.safeToRelease;
      }));
    },
    async finalize() {
      clearInterval(live);
      const failures: unknown[] = [];

      for (const job of [
        () => recorder.drain(),
        () => recorder.capture(session, 'final'),
        () => recorder.finalizeVideo(session),
      ]) {
        try {
          await job();
        } catch (error) {
          failures.push(error);
        }
      }

      if (failures.length) throw new AggregateError(failures, 'Native evidence incomplete');
    },
  };

  try {
    const observation = await session.observe(signal);

    if (expectedEnvironment) {
      for (const key of ['osVersion', 'driverVersion', 'buildSha256']) {
        if (!expectedEnvironment[key] || expectedEnvironment[key] !== session.environment[key])
          throw new Error(`设备 ${key} 与录制不兼容，请重新录制`);
      }

      if (
        expectedEnvironment.viewport &&
        JSON.stringify(expectedEnvironment.viewport) !== JSON.stringify(observation.viewport)
      )
        throw new Error('设备屏幕与录制不兼容');
    }

    runtime.environment.viewport = observation.viewport;
    live = setInterval(() => recorder.sample(session), previewInterval());

    return runtime;
  } catch (error) {
    try {
      await finalizeRuntime(runtime, true);
    } catch (cleanupError) {
      throw new RuntimeOpenError(
        new AggregateError([error, cleanupError], '准备与归档或清理失败'),
        runtime.healthy,
      );
    }

    throw new RuntimeOpenError(error, runtime.healthy);
  }
}
