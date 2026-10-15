import type { RuntimeInput, PlatformRuntime } from '@testdog/server/runs/runtimeTypes';
import { openNativeRuntime } from '@testdog/server/runs/nativeRuntime';
import { openWebRuntime } from '@testdog/server/runs/webRuntime';

export function openPlatformRuntime(input: RuntimeInput): Promise<PlatformRuntime> {
  const target = input.run.targetSnapshot;

  return target.platform === 'web'
    ? openWebRuntime(input, target)
    : openNativeRuntime(input, target);
}
