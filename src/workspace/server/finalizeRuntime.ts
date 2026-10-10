import type { PlatformRuntime } from '@/automation/platform/runtime';

async function within<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Evidence deadlines do not prove a browser is unsafe. Give cleanup its own
// deadline, including when archival is still blocked on external persistence.
export async function finalizeRuntime(runtime: PlatformRuntime, interrupted: boolean) {
  const failures: unknown[] = [];
  try {
    await within(runtime.finalize(interrupted), 30000, '证据归档超过 30 秒上限');
  } catch (error) {
    failures.push(error);
  }
  if (runtime.cleanup) {
    try {
      await within(runtime.cleanup(), 10000, '浏览器清理超过 10 秒上限，资源将保持隔离');
    } catch (error) {
      runtime.healthy = false;
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, '归档或资源清理失败');
}
