import { expect, it } from 'vitest';
import { jsonResponse } from './jsonResponse';

it('returns an unchanged representation without a body and invalidates it when content changes', async () => {
  const request = new Request('http://localhost/run');
  const data = { run: { status: 'running', steps: [], artifacts: [], events: [] } };
  const initial = jsonResponse(request, data);
  expect(await initial.json()).toEqual(data);
  const etag = initial.headers.get('etag')!;
  for (const value of [etag, `W/${etag}`, `"other", ${etag}`]) {
    const same = jsonResponse(new Request(request, { headers: { 'If-None-Match': value } }), data);
    expect(same.status).toBe(304);
    expect(same.body).toBeNull();
  }
  for (const patch of [
    { status: 'passed' },
    { steps: [{ status: 'passed' }] },
    { artifacts: [{ id: 'frame' }] },
    { events: [{ message: 'new log' }] },
  ]) {
    const changed = jsonResponse(new Request(request, { headers: { 'If-None-Match': etag } }), {
      run: { ...data.run, ...patch },
    });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).not.toBe(etag);
  }
});
