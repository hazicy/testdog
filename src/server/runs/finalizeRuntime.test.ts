import { afterEach, expect, it, vi } from 'vitest';
import type { PlatformRuntime } from '@/server/runs/runtime';
import { finalizeRuntime } from './finalizeRuntime';

afterEach(() => vi.useRealTimers());

it('closes the browser after an archive deadline and preserves the evidence failure', async () => {
  vi.useFakeTimers();
  const runtime = {
    healthy: false,
    finalize: vi.fn(() => new Promise<void>(() => {})),
    cleanup: vi.fn(async () => {
      runtime.healthy = true;
    }),
  };
  const finishing = finalizeRuntime(runtime as unknown as PlatformRuntime, false);
  const rejected = expect(finishing).rejects.toMatchObject({
    errors: [expect.objectContaining({ message: '证据归档超过 30 秒上限' })],
  });

  await vi.advanceTimersByTimeAsync(30000);
  await rejected;
  expect(runtime.cleanup).toHaveBeenCalledOnce();
  expect(runtime.healthy).toBe(true);
});

it('keeps an unconfirmed browser cleanup quarantined and bounds its wait', async () => {
  vi.useFakeTimers();
  const runtime = {
    healthy: false,
    finalize: vi.fn(async () => {
      throw new Error('evidence failed');
    }),
    cleanup: vi.fn(() => new Promise<void>(() => {})),
  };
  const finishing = finalizeRuntime(runtime as unknown as PlatformRuntime, true);
  const rejected = expect(finishing).rejects.toMatchObject({
    errors: [
      expect.objectContaining({ message: 'evidence failed' }),
      expect.objectContaining({ message: '浏览器清理超过 10 秒上限，资源将保持隔离' }),
    ],
  });

  await vi.advanceTimersByTimeAsync(10000);
  await rejected;
  expect(runtime.healthy).toBe(false);
});

it('reports close failures even after successful evidence archival', async () => {
  const runtime = {
    healthy: false,
    finalize: vi.fn(async () => {}),
    cleanup: vi.fn(async () => {
      throw new Error('browser close failed');
    }),
  };

  await expect(finalizeRuntime(runtime as unknown as PlatformRuntime, false)).rejects.toMatchObject(
    { errors: [expect.objectContaining({ message: 'browser close failed' })] },
  );
  expect(runtime.healthy).toBe(false);
});

it('preserves native cleanup health checks without introducing browser cleanup', async () => {
  const runtime = {
    healthy: false,
    finalize: vi.fn(async () => {
      throw new Error('native cleanup unconfirmed');
    }),
  };

  await expect(finalizeRuntime(runtime as unknown as PlatformRuntime, false)).rejects.toThrow();
  expect(runtime.healthy).toBe(false);
});
