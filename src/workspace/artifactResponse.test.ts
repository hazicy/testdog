import { mkdtemp, mkdir, open, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { artifactResponse } from './artifactResponse';

let directory: string;
let root: string;
let path: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'caseforge-artifacts-'));
  root = join(directory, 'artifacts');
  await mkdir(root);
  path = join(root, 'video.webm');
  await writeFile(path, '0123456789');
});
afterEach(() => rm(directory, { recursive: true, force: true }));
const artifact = () => ({ path, kind: 'video', contentType: 'video/webm', id: 'recording' });
const request = (range?: string, method = 'GET') =>
  new Request('http://localhost/artifact', {
    method,
    headers: range === undefined ? {} : { Range: range },
  });

describe('artifact delivery', () => {
  it('streams the complete file with cache and media headers', async () => {
    const response = await artifactResponse(request(), artifact(), root);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.headers.get('content-type')).toBe('video/webm');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(await response.text()).toBe('0123456789');
  });

  it.each([
    ['bytes=2-5', '2345', 'bytes 2-5/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=7-999', '789', 'bytes 7-9/10'],
    ['bytes=-999', '0123456789', 'bytes 0-9/10'],
    ['bytes=0-0', '0', 'bytes 0-0/10'],
  ])('serves %s precisely', async (range, body, contentRange) => {
    const response = await artifactResponse(request(range), artifact(), root);
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(contentRange);
    expect(response.headers.get('content-length')).toBe(String(body.length));
    expect(await response.text()).toBe(body);
  });

  it.each([
    '',
    'bytes=-0',
    'bytes=-',
    'bytes=10-',
    'bytes=5-2',
    'bytes=0-1,4-5',
    'bytes=9007199254740992-',
    'bytes=0-9007199254740992',
  ])('rejects invalid or unsatisfiable range %s', async (range) => {
    const response = await artifactResponse(request(range), artifact(), root);
    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe('bytes */10');
    expect(await response.text()).toBe('');
  });

  it('provides HEAD metadata without a response body and ignores Range', async () => {
    const response = await artifactResponse(request('bytes=2-5', 'HEAD'), artifact(), root);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.body).toBeNull();
  });

  it('handles empty artifacts and rejects ranges for them', async () => {
    await writeFile(path, '');
    const response = await artifactResponse(request(), artifact(), root);
    expect(response.headers.get('content-length')).toBe('0');
    expect(response.body).toBeNull();
    const ranged = await artifactResponse(request('bytes=0-'), artifact(), root);
    expect(ranged.status).toBe(416);
    expect(ranged.headers.get('content-range')).toBe('bytes */0');
  });

  it('rejects paths outside the root, including symlink escapes', async () => {
    const outside = join(directory, 'secret');
    await writeFile(outside, 'secret');
    expect((await artifactResponse(request(), { ...artifact(), path: outside }, root)).status).toBe(
      403,
    );
    const link = join(root, 'link');
    await symlink(outside, link);
    expect((await artifactResponse(request(), { ...artifact(), path: link }, root)).status).toBe(
      403,
    );
    expect((await artifactResponse(request(), { ...artifact(), path: root }, root)).status).toBe(
      403,
    );
  });

  it('reads a small range from a large recording without buffering the full file', async () => {
    const file = await open(path, 'w');
    const offset = 512 * 1024 * 1024;
    await file.write(Buffer.from('tail'), 0, 4, offset);
    await file.close();
    const response = await artifactResponse(request(`bytes=${offset}-`), artifact(), root);
    expect(response.headers.get('content-length')).toBe('4');
    expect(await response.text()).toBe('tail');
  });

  it('allows consumers to cancel a download', async () => {
    const response = await artifactResponse(request(), artifact(), root);
    await response.body!.cancel();
  });

  it('sets download filenames for videos and traces', async () => {
    const video = await artifactResponse(
      new Request('http://localhost/artifact?download'),
      artifact(),
      root,
    );
    expect(video.headers.get('content-disposition')).toBe(
      'attachment; filename="video-recording.webm"',
    );
    await video.body!.cancel();
    const trace = await artifactResponse(request(), { ...artifact(), kind: 'trace' }, root);
    expect(trace.headers.get('content-disposition')).toBe(
      'attachment; filename="trace-recording.zip"',
    );
    await trace.body!.cancel();
  });
});
