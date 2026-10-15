import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { storeArtifactFile } from '@testdog/server/runs/artifactStorage';
import { serveArtifact } from '@testdog/server/runs/artifactResponse';

afterEach(() => vi.unstubAllEnvs());

test('private S3 upload, retrieval and rollback use the exact owned object key', async () => {
  const objects = new Map<string, Buffer>();
  const requests: string[] = [];
  const server = createServer(async (request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname;

    requests.push(`${request.method} ${path}`);
    expect(request.headers['x-amz-acl']).toBeUndefined();
    if (request.method === 'PUT') {
      const chunks: Buffer[] = [];

      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      let bytes = Buffer.concat(chunks);

      // S3 streaming uploads encode chunks plus a checksum trailer.
      if (request.headers['content-encoding'] === 'aws-chunked') {
        const decoded: Buffer[] = [];
        let offset = 0;

        while (offset < bytes.length) {
          const end = bytes.indexOf('\r\n', offset);
          const size = Number.parseInt(bytes.toString('ascii', offset, end), 16);

          if (!size) break;
          decoded.push(bytes.subarray(end + 2, end + 2 + size));
          offset = end + 2 + size + 2;
        }

        bytes = Buffer.concat(decoded);
        expect(bytes.length).toBe(Number(request.headers['x-amz-decoded-content-length']));
      }

      objects.set(path, bytes);
      response.end();
    } else if (request.method === 'DELETE') {
      objects.delete(path);
      response.statusCode = 204;
      response.end();
    } else {
      const bytes = objects.get(path)!;

      response.setHeader('Content-Length', bytes.length);
      if (request.method === 'HEAD') response.end();
      else if (request.headers.range) {
        const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range)!;
        const chunk = bytes.subarray(Number(start), Number(end) + 1);

        response.statusCode = 206;
        response.setHeader('Content-Length', chunk.length);
        response.setHeader('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
        response.end(chunk);
      } else response.end(bytes);
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  configureS3((server.address() as { port: number }).port);
  const directory = await mkdtemp(join(tmpdir(), 'testdog-s3-'));

  try {
    const path = join(directory, 'screen.png');

    await writeFile(path, Buffer.from([137, 80, 78, 71]));
    const stored = await storeArtifactFile('run', 'artifact', path, 'image/png');

    expect(stored.path).toBe('s3://private-evidence/tests/run/artifact');
    const artifact = {
      runId: 'run',
      id: 'artifact',
      path: stored.path,
      kind: 'screenshot',
      contentType: 'image/png',
    };
    const complete = await serveArtifact(new Request('http://localhost/artifact'), artifact);

    expect(Buffer.from(await complete.arrayBuffer())).toEqual(Buffer.from([137, 80, 78, 71]));
    await expect(
      serveArtifact(new Request('http://localhost/artifact'), {
        ...artifact,
        runId: 'another-run',
      }),
    ).rejects.toThrow('Invalid artifact object reference');
    const served = await serveArtifact(
      new Request('http://localhost/artifact', { headers: { Range: 'bytes=1-2' } }),
      {
        runId: 'run',
        id: 'artifact',
        path: stored.path,
        kind: 'screenshot',
        contentType: 'image/png',
      },
    );

    expect(served.status).toBe(206);
    expect(served.headers.get('content-range')).toBe('bytes 1-2/4');
    expect(Buffer.from(await served.arrayBuffer())).toEqual(Buffer.from([80, 78]));
    const head = await serveArtifact(
      new Request('http://localhost/artifact', {
        method: 'HEAD',
        headers: { Range: 'bytes=1-2' },
      }),
      { runId: 'run', id: 'artifact', path: stored.path, kind: 'video', contentType: 'video/webm' },
    );

    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('4');
    expect(head.body).toBeNull();
    await stored.rollback();
    expect(objects.size).toBe(0);
    expect(requests).toEqual([
      'PUT /private-evidence/tests/run/artifact',
      'HEAD /private-evidence/tests/run/artifact',
      'GET /private-evidence/tests/run/artifact',
      'HEAD /private-evidence/tests/run/artifact',
      'GET /private-evidence/tests/run/artifact',
      'HEAD /private-evidence/tests/run/artifact',
      'DELETE /private-evidence/tests/run/artifact',
    ]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test('remote ranges fetch only requested bytes, while HEAD and invalid ranges fetch metadata only', async () => {
  const requests: { method: string; range?: string; match?: string }[] = [];
  let size = 10;
  const server = createServer((request, response) => {
    requests.push({
      method: request.method!,
      range: request.headers.range,
      match: request.headers['if-match'],
    });
    response.setHeader('Content-Length', size);
    response.setHeader('ETag', '"fixture"');
    if (request.method === 'HEAD') return response.end();
    const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range!)!;
    const bytes =
      size === 10
        ? Buffer.from('0123456789').subarray(Number(start), Number(end) + 1)
        : Buffer.from('tail');

    response.statusCode = 206;
    response.setHeader('Content-Length', bytes.length);
    response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    response.end(bytes);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  configureS3((server.address() as { port: number }).port);
  const artifact = {
    runId: 'run',
    id: 'video',
    path: 's3://private-evidence/tests/run/video',
    kind: 'video',
    contentType: 'video/webm',
  };
  const serve = (range?: string, method = 'GET') =>
    serveArtifact(
      new Request('http://localhost/artifact', {
        method,
        headers: range === undefined ? {} : { Range: range },
      }),
      artifact,
    );

  try {
    for (const [range, body, normalized] of [
      ['bytes=2-5', '2345', 'bytes=2-5'],
      ['bytes=7-', '789', 'bytes=7-9'],
      ['bytes=-3', '789', 'bytes=7-9'],
      ['bytes=7-999', '789', 'bytes=7-9'],
      ['bytes=-999', '0123456789', 'bytes=0-9'],
      ['bytes=0-0', '0', 'bytes=0-0'],
    ]) {
      requests.length = 0;
      const response = await serve(range);

      expect(response.status).toBe(206);
      expect(await response.text()).toBe(body);
      expect(requests).toEqual([
        { method: 'HEAD', range: undefined, match: undefined },
        { method: 'GET', range: normalized, match: '"fixture"' },
      ]);
    }

    for (const range of [
      '',
      'bytes=-0',
      'bytes=10-',
      'bytes=5-2',
      'bytes=0-1,4-5',
      'bytes=9007199254740992-',
    ]) {
      requests.length = 0;
      const response = await serve(range);

      expect(response.status).toBe(416);
      expect(response.headers.get('content-range')).toBe('bytes */10');
      expect(requests.map((request) => request.method)).toEqual(['HEAD']);
    }

    requests.length = 0;
    const head = await serve('bytes=2-5', 'HEAD');

    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('10');
    expect(head.body).toBeNull();
    expect(requests.map((request) => request.method)).toEqual(['HEAD']);
    size = 0;
    requests.length = 0;
    const empty = await serve();

    expect(empty.body).toBeNull();
    expect(empty.headers.get('content-length')).toBe('0');
    expect((await serve('bytes=0-')).status).toBe(416);
    expect(requests.map((request) => request.method)).toEqual(['HEAD', 'HEAD']);
    size = 512 * 1024 * 1024 + 4;
    requests.length = 0;
    const tail = await serve(`bytes=${size - 4}-`);

    expect(await tail.text()).toBe('tail');
    expect(tail.headers.get('content-length')).toBe('4');
    expect(requests.at(-1)?.range).toBe(`bytes=${size - 4}-${size - 1}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test.each(['cancel', 'abort', 'error'])(
  'remote downloads stream before completion and release connections on %s',
  async (action) => {
    let download: import('node:http').ServerResponse | undefined;
    let closed = false;
    const server = createServer((request, response) => {
      response.setHeader('Content-Length', 512 * 1024 * 1024);
      if (request.method === 'HEAD') return response.end();
      download = response;
      response.once('close', () => {
        closed = true;
      });
      response.write('first chunk');
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    configureS3((server.address() as { port: number }).port);
    const controller = new AbortController();

    try {
      const response = await serveArtifact(
        new Request('http://localhost/artifact', { signal: controller.signal }),
        {
          runId: 'run',
          id: 'video',
          path: 's3://private-evidence/tests/run/video',
          kind: 'video',
          contentType: 'video/webm',
        },
      );
      const reader = response.body!.getReader();
      const first = await reader.read();

      expect(new TextDecoder().decode(first.value)).toBe('first chunk');
      if (action === 'cancel') await reader.cancel();
      else {
        if (action === 'abort') controller.abort();
        else download!.destroy();
        await expect(reader.read()).rejects.toThrow();
      }

      await vi.waitFor(() => expect(closed).toBe(true));
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

function configureS3(port: number) {
  vi.stubEnv('TESTDOG_ARTIFACT_ENDPOINT', `http://127.0.0.1:${port}`);
  vi.stubEnv('TESTDOG_ARTIFACT_BUCKET', 'private-evidence');
  vi.stubEnv('TESTDOG_ARTIFACT_PREFIX', 'tests');
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'fixture');
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'fixture');
}
