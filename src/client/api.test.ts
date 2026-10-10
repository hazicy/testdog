import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('JSON transport', () => {
  it('passes request options, including abort signals, to fetch', async () => {
    let submitted: unknown;
    const fetch = vi.fn(async (request: Request) => {
      submitted = await request.json();

      return Response.json({ run: { id: 'run' } });
    });

    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();

    expect(
      await api('http://localhost/api/runs', {
        method: 'POST',
        headers: { 'X-Request-Id': 'test-request' },
        json: { testId: 'test' },
        signal: controller.signal,
      }).json(),
    ).toEqual({
      run: { id: 'run' },
    });
    expect(fetch.mock.calls[0][0]).toMatchObject({
      url: 'http://localhost/api/runs',
      method: 'POST',
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
    expect(fetch.mock.calls[0][0].headers.get('x-request-id')).toBe('test-request');
    expect(submitted).toEqual({ testId: 'test' });
  });

  it('preserves actionable server error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ message: '已有测试正在执行' }, { status: 409 })),
    );
    await expect(api('http://localhost/api/runs').json()).rejects.toThrow('已有测试正在执行');
    await expect(api('http://localhost/api/runs').json()).rejects.toMatchObject({
      response: { status: 409 },
    });
  });

  it.each([null, { message: 503 }, { error: 'offline' }])(
    'handles error bodies without a message',
    async (body) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body, { status: 503 })));
      await expect(api('http://localhost/api/runs').json()).rejects.toThrow(
        '请求失败，请稍后重试。',
      );
    },
  );

  it('handles HTML proxy errors without exposing JSON parser internals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<h1>Bad Gateway</h1>', { status: 502 })),
    );
    await expect(api('http://localhost/api/runs').json()).rejects.toThrow(
      '服务响应异常，请稍后重试。',
    );
    // Use a new body because Response.json() consumes the original stream.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })));
    await expect(api('http://localhost/api/runs').json()).rejects.toMatchObject({
      response: { status: 502 },
    });
  });

  it('propagates fetch cancellation', async () => {
    const error = new DOMException('Cancelled', 'AbortError');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
    await expect(api('http://localhost/api/runs').json()).rejects.toBe(error);
  });

  it.each(['GET', 'POST'])(
    'times out stalled %s requests and releases the timer',
    async (method) => {
      vi.useFakeTimers();
      vi.stubGlobal(
        'fetch',
        vi.fn(
          ({ signal }: Request) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            }),
        ),
      );
      const pending = api('http://localhost/api/runs', { method }).json();
      const failure = expect(pending).rejects.toMatchObject({
        name: 'TimeoutError',
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
      vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10000));

        return new Response(new ReadableStream());
      }),
    );
    const pending = api('http://localhost/api/runs').json();
    const failure = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });

    await vi.advanceTimersByTimeAsync(15000);
    await failure;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('forwards caller cancellation and releases the timeout', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    let started!: () => void;
    const fetching = new Promise<void>((resolve) => {
      started = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(
        ({ signal }: Request) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            started();
          }),
      ),
    );
    const pending = api('http://localhost/api/runs', { signal: caller.signal }).json();
    const reason = new DOMException('Unmounted', 'AbortError');
    const failure = expect(pending).rejects.toBe(reason);

    await fetching;
    caller.abort(reason);
    await failure;
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['GET', 'POST', 'DELETE', 'PATCH'])(
    'does not automatically retry failed %s requests',
    async (method) => {
      const fetch = vi.fn(async () =>
        Response.json({ message: '服务暂时不可用' }, { status: 503 }),
      );

      vi.stubGlobal('fetch', fetch);
      await expect(api('http://localhost/api/runs', { method }).json()).rejects.toMatchObject({
        response: { status: 503 },
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('does not automatically retry network failures', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    vi.stubGlobal('fetch', fetch);
    await expect(api('http://localhost/api/runs').json()).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not fetch when the caller is already cancelled', async () => {
    const fetch = vi.fn();

    vi.stubGlobal('fetch', fetch);
    const reason = new DOMException('Unmounted', 'AbortError');

    await expect(
      api('http://localhost/api/runs', { signal: AbortSignal.abort(reason) }).json(),
    ).rejects.toBe(reason);
    expect(fetch).not.toHaveBeenCalled();
  });
});
