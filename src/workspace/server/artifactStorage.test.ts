import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { artifactRoot, readArtifactFile, storeArtifactFile } from './artifactStorage';

afterEach(() => vi.unstubAllEnvs());

test('local artifacts must belong to the requested run directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'caseforge-artifacts-'));

  vi.stubEnv('CASEFORGE_DATA_DIR', directory);
  vi.stubEnv('CASEFORGE_ARTIFACT_BUCKET', '');
  try {
    await mkdir(join(artifactRoot(), 'run'), { recursive: true });
    const path = join(artifactRoot(), 'run', 'image.png');

    await writeFile(path, 'image');
    expect((await readArtifactFile('run', 'image', path)).toString()).toBe('image');
    await expect(readArtifactFile('other-run', 'image', path)).rejects.toThrow(
      'Invalid artifact path',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

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
      objects.set(path, Buffer.concat(chunks));
      response.end();
    } else if (request.method === 'DELETE') {
      objects.delete(path);
      response.statusCode = 204;
      response.end();
    } else response.end(objects.get(path));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };

  vi.stubEnv('CASEFORGE_ARTIFACT_ENDPOINT', `http://127.0.0.1:${address.port}`);
  vi.stubEnv('CASEFORGE_ARTIFACT_BUCKET', 'private-evidence');
  vi.stubEnv('CASEFORGE_ARTIFACT_PREFIX', 'tests');
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'fixture');
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'fixture');
  const directory = await mkdtemp(join(tmpdir(), 'caseforge-s3-'));
  try {
    const path = join(directory, 'screen.png');

    await writeFile(path, Buffer.from([137, 80, 78, 71]));
    const stored = await storeArtifactFile('run', 'artifact', path, 'image/png');

    expect(stored.path).toBe('s3://private-evidence/tests/run/artifact');
    expect(await readArtifactFile('run', 'artifact', stored.path)).toEqual(
      Buffer.from([137, 80, 78, 71]),
    );
    await expect(readArtifactFile('another-run', 'artifact', stored.path)).rejects.toThrow(
      'Invalid artifact object reference',
    );
    await stored.rollback();
    expect(objects.size).toBe(0);
    expect(requests).toEqual([
      'PUT /private-evidence/tests/run/artifact',
      'GET /private-evidence/tests/run/artifact',
      'DELETE /private-evidence/tests/run/artifact',
    ]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
