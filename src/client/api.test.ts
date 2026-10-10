import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJsonReader, requestJson } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('JSON transport', () => {
  it('reuses unchanged reads, retains cache across errors and replaces it with new data', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ value: 1 }, { headers: { ETag: '"first"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json({ value: 2 }, { headers: { ETag: '"second"' } }));

    vi.stubGlobal('fetch', fetch);
    const read = createJsonReader<{ value: number }>('/api/run');
    const first = await read();

    expect(await read()).toBe(first);
    expect(fetch.mock.calls[1][1].headers.get('if-none-match')).toBe('"first"');
    await expect(read()).rejects.toThrow('offline');
    expect(await read()).toEqual({ value: 2 });
    expect(fetch.mock.calls[3][1].headers.get('if-none-match')).toBe('"first"');
    const independent = createJsonReader('/api/other');

    fetch.mockResolvedValueOnce(Response.json({ value: 3 }));
    await independent();
    expect(fetch.mock.calls[4][1].headers.has('if-none-match')).toBe(false);
  });
  it('passes request options, including abort signals, to fetch', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ run: { id: 'run' } }));

    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();

    expect(await requestJson('/api/runs', { signal: controller.signal })).toEqual({
      run: { id: 'run' },
    });
    expect(fetch).toHaveBeenCalledWith('/api/runs', {
      cache: 'no-store',
      headers: expect.any(Headers),
      signal: expect.any(AbortSignal),
    });
  });

  it('preserves actionable server error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ message: '已有测试正在执行' }, { status: 409 })),
    );
    await expect(requestJson('/api/runs')).rejects.toThrow('已有测试正在执行');
    await expect(requestJson('/api/runs')).rejects.toMatchObject({ status: 409 });
  });

  it.each([null, { message: 503 }, { error: 'offline' }])(
    'handles error bodies without a message',
    async (body) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body, { status: 503 })));
      await expect(requestJson('/api/runs')).rejects.toThrow('请求失败，请稍后重试。');
    },
  );

  it('handles HTML proxy errors without exposing JSON parser internals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<h1>Bad Gateway</h1>', { status: 502 })),
    );
    await expect(requestJson('/api/runs')).rejects.toThrow('服务响应异常，请稍后重试。');
    // Use a new body because Response.json() consumes the original stream.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })));
    await expect(requestJson('/api/runs')).rejects.toMatchObject({ status: 502 });
  });

  it('propagates fetch cancellation', async () => {
    const error = new DOMException('Cancelled', 'AbortError');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
    await expect(requestJson('/api/runs')).rejects.toBe(error);
  });

  it.each(['GET', 'POST'])(
    'times out stalled %s requests and releases the timer',
    async (method) => {
      vi.useFakeTimers();
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url, { signal }) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            }),
        ),
      );
      const pending = requestJson('/api/runs', { method });
      const failure = expect(pending).rejects.toMatchObject({
        status: 408,
        message:
          method === 'GET'
            ? '请求超时，请稍后重试。'
            : '请求超时，操作可能已完成，请刷新确认后再试。',
      });

      await vi.advanceTimersByTimeAsync(15000);
      await failure;
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('applies the deadline to a stalled response body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, { signal }) => ({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          }),
      })),
    );
    const pending = requestJson('/api/runs');
    const failure = expect(pending).rejects.toMatchObject({ status: 408 });

    await vi.advanceTimersByTimeAsync(15000);
    await failure;
  });

  it('forwards caller cancellation and cleans up its listener and timer', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, 'removeEventListener');

    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          }),
      ),
    );
    const pending = requestJson('/api/runs', { signal: caller.signal });
    const reason = new DOMException('Unmounted', 'AbortError');
    const failure = expect(pending).rejects.toBe(reason);

    caller.abort(reason);
    await failure;
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not fetch when the caller is already cancelled', async () => {
    const fetch = vi.fn();

    vi.stubGlobal('fetch', fetch);
    const reason = new DOMException('Unmounted', 'AbortError');

    await expect(requestJson('/api/runs', { signal: AbortSignal.abort(reason) })).rejects.toBe(
      reason,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
