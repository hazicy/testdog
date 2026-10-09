import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestJson } from './api';

afterEach(() => vi.unstubAllGlobals());
describe('JSON transport', () => {
  it('passes request options, including abort signals, to fetch', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ run: { id: 'run' } }));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    expect(await requestJson('/api/runs', { signal: controller.signal })).toEqual({
      run: { id: 'run' },
    });
    expect(fetch).toHaveBeenCalledWith('/api/runs', {
      cache: 'no-store',
      signal: controller.signal,
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
});
