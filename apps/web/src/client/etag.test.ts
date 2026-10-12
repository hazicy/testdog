import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJsonReader } from '@/client/etag';

afterEach(() => vi.unstubAllGlobals());

describe('conditional JSON reads', () => {
  it('reuses unchanged reads, retains cache across errors and replaces it with new data', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ value: 1 }, { headers: { ETag: '"first"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json({ value: 2 }, { headers: { ETag: '"second"' } }));

    vi.stubGlobal('fetch', fetch);
    const read = createJsonReader<{ value: number }>('http://localhost/api/run');
    const first = await read();

    expect(await read()).toBe(first);
    expect(fetch.mock.calls[1][0].headers.get('if-none-match')).toBe('"first"');
    await expect(read()).rejects.toThrow('offline');
    expect(await read()).toEqual({ value: 2 });
    expect(fetch.mock.calls[3][0].headers.get('if-none-match')).toBe('"first"');
    const independent = createJsonReader('http://localhost/api/other');

    fetch.mockResolvedValueOnce(Response.json({ value: 3 }));
    await independent();
    expect(fetch.mock.calls[4][0].headers.has('if-none-match')).toBe(false);
  });
});
