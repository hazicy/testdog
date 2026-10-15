import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export const artifactRoot = () =>
  join(process.env.TESTDOG_DATA_DIR || join(process.cwd(), '.automation'), 'artifacts');

function remote() {
  const bucket = process.env.TESTDOG_ARTIFACT_BUCKET;

  if (!bucket) return undefined;
  const prefix = (process.env.TESTDOG_ARTIFACT_PREFIX || 'testdog').replace(/^\/+|\/+$/g, '');

  if (!prefix || prefix.split('/').some((part) => part === '..'))
    throw new Error('Invalid artifact prefix');

  return {
    bucket,
    prefix,
    client: new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.TESTDOG_ARTIFACT_ENDPOINT || undefined,
      forcePathStyle: !!process.env.TESTDOG_ARTIFACT_ENDPOINT,
      maxAttempts: 2,
    }),
  };
}

export async function storeArtifactFile(
  runId: string,
  id: string,
  path: string,
  contentType: string,
) {
  const config = remote();

  if (!config) return { path, rollback: async () => {} };
  const key = `${config.prefix}/${runId}/${id}`;
  let body: ReturnType<typeof createReadStream> | undefined;

  try {
    const { size } = await stat(path);

    body = createReadStream(path);
    await config.client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentLength: size,
        ContentType: contentType,
      }),
      { abortSignal: AbortSignal.timeout(20000) },
    );
  } finally {
    body?.destroy();
    config.client.destroy();
  }

  return {
    path: `s3://${config.bucket}/${key}`,
    rollback: async () => {
      const cleanup = remote()!;

      try {
        await cleanup.client.send(new DeleteObjectCommand({ Bucket: cleanup.bucket, Key: key }), {
          abortSignal: AbortSignal.timeout(10000),
        });
      } finally {
        cleanup.client.destroy();
      }
    },
  };
}

// The caller closes metadata-only reads; a returned stream owns the client until closed.
export async function openRemoteArtifact(
  runId: string,
  id: string,
  path: string,
  signal: AbortSignal,
) {
  const config = remote();

  if (!config || path !== `s3://${config.bucket}/${config.prefix}/${runId}/${id}`) {
    config?.client.destroy();
    throw new Error('Invalid artifact object reference');
  }

  const object = { Bucket: config.bucket, Key: `${config.prefix}/${runId}/${id}` };
  const close = () => config.client.destroy();

  try {
    const metadata = await config.client.send(new HeadObjectCommand(object), {
      abortSignal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    });
    const size = metadata.ContentLength;

    if (size === undefined || !Number.isSafeInteger(size) || size < 0)
      throw new Error('Artifact size unavailable');

    return {
      size,
      close,
      async stream(range?: { start: number; end: number }) {
        // Bound the wait for headers without cutting off an active large download.
        const timeout = new AbortController();
        const timer = setTimeout(() => timeout.abort(), 20000);
        const result = await config.client
          .send(
            new GetObjectCommand({
              ...object,
              ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
              IfMatch: metadata.ETag,
            }),
            { abortSignal: AbortSignal.any([signal, timeout.signal]) },
          )
          .finally(() => clearTimeout(timer));

        if (!(result.Body instanceof Readable)) throw new Error('Artifact body unavailable');
        const body = result.Body;
        const abort = () => body.destroy();

        signal.addEventListener('abort', abort, { once: true });
        body.once('close', () => {
          signal.removeEventListener('abort', abort);
          close();
        });
        if (signal.aborted) abort();

        return Readable.toWeb(body, {
          strategy: { size: (chunk: Uint8Array) => chunk.byteLength },
        }) as ReadableStream<Uint8Array>;
      },
    };
  } catch (error) {
    close();
    throw error;
  }
}
