import type { PlatformRuntime } from '@testdog/server/runs/runtime';

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

// Evidence deadlines do not prove a session is unsafe. Give cleanup its own
// deadline, including when archival is still blocked on external persistence.
export async function finalizeRuntime(runtime: PlatformRuntime, interrupted: boolean) {
  const failures: unknown[] = [];

  try {
    await within(runtime.finalize(interrupted), 30000, '证据归档超过 30 秒上限');
  } catch (error) {
    failures.push(error);
  }

  try {
    await cleanupRuntime(runtime);
  } catch (error) {
    failures.push(error);
  }

  if (failures.length) throw new AggregateError(failures, '归档或资源清理失败');
}

export async function cleanupRuntime(runtime: Pick<PlatformRuntime, 'cleanup' | 'healthy'>) {
  if (!runtime.cleanup) return;
  try {
    await within(runtime.cleanup(), 10000, '执行会话清理超过 10 秒上限，资源将保持隔离');
  } catch (error) {
    runtime.healthy = false;
    throw error;
  }
}
