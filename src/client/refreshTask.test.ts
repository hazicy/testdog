import { describe, expect, it, vi } from 'vitest';
import { createRefreshTask } from './refreshTask';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('refresh coordination', () => {
  it('coalesces timer and focus refreshes while a slow request is running', async () => {
    const response = deferred();
    const load = vi.fn<(signal: AbortSignal) => Promise<void>>(() => response.promise);
    const task = createRefreshTask(load);
    const pending = task.refresh();
    await Promise.resolve();
    expect(task.refresh()).toBe(pending);
    expect(task.refresh()).toBe(pending);
    expect(load).toHaveBeenCalledTimes(1);
    response.resolve();
    await pending;
    await task.refresh();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reads again after a mutation even when an earlier request is still running', async () => {
    const response = deferred();
    const load = vi
      .fn()
      .mockImplementationOnce(() => response.promise)
      .mockResolvedValue(undefined);
    const task = createRefreshTask(load);
    const pending = task.refresh();
    await Promise.resolve();
    expect(task.refresh(true)).toBe(pending);
    expect(task.refresh(true)).toBe(pending);
    response.resolve();
    await pending;
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('aborts in-flight requests and never starts queued requests after unmount', async () => {
    const response = deferred();
    const load = vi.fn<(signal: AbortSignal) => Promise<void>>(() => response.promise);
    const task = createRefreshTask(load);
    const pending = task.refresh();
    await Promise.resolve();
    void task.refresh(true);
    task.dispose();
    expect(load.mock.calls[0][0].aborted).toBe(true);
    response.resolve();
    await pending;
    await task.refresh(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not start requests if disposed before the first scheduled read', async () => {
    const load = vi.fn(async () => {});
    const task = createRefreshTask(load);
    const pending = task.refresh();
    task.dispose();
    await pending;
    expect(load).not.toHaveBeenCalled();
  });

  it('allows retrying after a failed request', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const task = createRefreshTask(load);
    await expect(task.refresh()).rejects.toThrow('offline');
    await task.refresh();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('runs a queued mutation refresh even when the earlier read fails', async () => {
    const response = deferred();
    const load = vi
      .fn()
      .mockImplementationOnce(() => response.promise)
      .mockResolvedValue(undefined);
    const task = createRefreshTask(load);
    const pending = task.refresh();
    await Promise.resolve();
    const updated = task.refresh(true);
    response.reject(new Error('Old read failed'));
    await expect(updated).resolves.toBeUndefined();
    await pending;
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reports the queued read failure and remains retryable', async () => {
    const response = deferred();
    const load = vi
      .fn()
      .mockImplementationOnce(() => response.promise)
      .mockRejectedValueOnce(new Error('Latest read failed'))
      .mockResolvedValue(undefined);
    const task = createRefreshTask(load);
    const pending = task.refresh();
    await Promise.resolve();
    void task.refresh(true);
    response.reject(new Error('Old read failed'));
    await expect(pending).rejects.toThrow('Latest read failed');
    await task.refresh();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('does not retry a failing request after disposal', async () => {
    const response = deferred();
    const load = vi.fn(() => response.promise);
    const task = createRefreshTask(load);
    const pending = task.refresh();
    await Promise.resolve();
    void task.refresh(true);
    task.dispose();
    response.reject(new Error('Aborted read'));
    await expect(pending).rejects.toThrow('Aborted read');
    expect(load).toHaveBeenCalledTimes(1);
  });
});
