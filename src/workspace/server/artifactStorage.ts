import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export const artifactRoot = () =>
  join(process.env.CASEFORGE_DATA_DIR || join(process.cwd(), '.automation'), 'artifacts');

function remote() {
  const bucket = process.env.CASEFORGE_ARTIFACT_BUCKET;
  if (!bucket) return undefined;
  const prefix = (process.env.CASEFORGE_ARTIFACT_PREFIX || 'caseforge').replace(/^\/+|\/+$/g, '');
  if (!prefix || prefix.split('/').some((part) => part === '..'))
    throw new Error('Invalid artifact prefix');

  return {
    bucket,
    prefix,
    client: new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.CASEFORGE_ARTIFACT_ENDPOINT || undefined,
      forcePathStyle: !!process.env.CASEFORGE_ARTIFACT_ENDPOINT,
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
  try {
    await config.client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: await readFile(path),
        ContentType: contentType,
      }),
      { abortSignal: AbortSignal.timeout(20000) },
    );
  } catch (error) {
    config.client.destroy();
    throw error;
  }
  config.client.destroy();

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

export async function readArtifactFile(runId: string, id: string, path: string): Promise<Buffer> {
  if (path.startsWith('s3://')) {
    const config = remote();
    if (!config || path !== `s3://${config.bucket}/${config.prefix}/${runId}/${id}`) {
      config?.client.destroy();
      throw new Error('Invalid artifact object reference');
    }
    try {
      const object = await config.client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: `${config.prefix}/${runId}/${id}`,
        }),
        { abortSignal: AbortSignal.timeout(20000) },
      );
      if (!object.Body) throw new Error('Artifact body unavailable');

      return Buffer.from(await object.Body.transformToByteArray());
    } finally {
      config.client.destroy();
    }
  }
  const local = relative(join(artifactRoot(), runId), path);
  if (!local || local.startsWith('..') || isAbsolute(local))
    throw new Error('Invalid artifact path');

  return readFile(path);
}
