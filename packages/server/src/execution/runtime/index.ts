import type { RuntimeInput, PlatformRuntime } from '@testdog/server/execution/runtime/types';
import { openNativeRuntime } from '@testdog/server/execution/runtime/native';
import { openWebRuntime } from '@testdog/server/execution/runtime/web';

export function openPlatformRuntime(input: RuntimeInput): Promise<PlatformRuntime> {
  const target = input.run.targetSnapshot;

  return target.platform === 'web'
    ? openWebRuntime(input, target)
    : openNativeRuntime(input, target);
}
