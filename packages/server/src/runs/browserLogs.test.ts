import { afterEach, expect, it, vi } from 'vitest';
import type { BrowserContext } from 'playwright';

const persistence = vi.hoisted(() => ({ append: vi.fn() }));

vi.mock('@testdog/server/runs/repository', () => ({ appendBrowserLogs: persistence.append }));
import { BrowserLogs } from '@testdog/server/runs/browserLogs';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

function fixture() {
  vi.useFakeTimers();
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const context = {
    on: vi.fn((event, handler) => handlers.set(event, handler)),
    off: vi.fn(),
  } as unknown as BrowserContext;
  const logs = new BrowserLogs('run', new Date().toISOString(), () => ({ pageId: 'page-1' }));

  logs.start(context);
  const consoleLog = (text: string) =>
    handlers.get('console')!({ page: () => null, type: () => 'log', text: () => text });

  return { logs, context, consoleLog };
}

it('does no persistence work when periodic flushes have no logs', async () => {
  const { logs, context } = fixture();

  await vi.advanceTimersByTimeAsync(5000);
  await logs.stop(context);
  expect(persistence.append).not.toHaveBeenCalled();
});

it('coalesces flushes during slow writes and drains new logs on stop', async () => {
  const { logs, context, consoleLog } = fixture();
  let release!: () => void;

  persistence.append.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  consoleLog('first');
  await vi.advanceTimersByTimeAsync(500);
  consoleLog('second');
  await vi.advanceTimersByTimeAsync(5000);
  expect(persistence.append).toHaveBeenCalledTimes(1);
  const stopping = logs.stop(context);

  release();
  await stopping;
  expect(persistence.append).toHaveBeenCalledTimes(2);
  expect(
    persistence.append.mock.calls.map(([, batch]) =>
      batch.map((log: { message: string }) => log.message),
    ),
  ).toEqual([['first'], ['second']]);
});

it('retries a failed batch in order and surfaces failures that remain on stop', async () => {
  const { logs, context, consoleLog } = fixture();

  persistence.append.mockRejectedValueOnce(new Error('retry'));
  consoleLog('first');
  await expect(logs.flush()).rejects.toThrow('retry');
  consoleLog('second');
  persistence.append.mockRejectedValueOnce(new Error('offline'));
  await expect(logs.stop(context)).rejects.toThrow('offline');
  expect(
    persistence.append.mock.calls[1][1].map((log: { message: string }) => log.message),
  ).toEqual(['first', 'second']);
});
