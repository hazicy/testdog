import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { WorkspaceError } from '@testdog/server/shared/errors';
import type { UserScope } from '@testdog/server/shared/ownership';

function key() {
  const secret = process.env.TESTDOG_INTEGRATION_SECRET || process.env.BETTER_AUTH_SECRET;

  if (!secret || secret.length < 32)
    throw new WorkspaceError('集成密钥未配置，请先配置服务端集成密钥。');

  return createHash('sha256').update(`testdog:notification:v1:${secret}`).digest();
}

export function encryptSecret(config: unknown, userId: UserScope, channel: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);

  cipher.setAAD(Buffer.from(JSON.stringify([userId, channel])));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);

  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSecret(value: string, userId: UserScope, channel: string): unknown {
  try {
    const [version, iv, tag, data] = value.split('.');

    if (version !== 'v1' || !iv || !tag || !data) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));

    decipher.setAAD(Buffer.from(JSON.stringify([userId, channel])));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));

    return JSON.parse(
      Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString(),
    );
  } catch {
    throw new WorkspaceError('集成配置无法解密，请重新填写并保存配置。');
  }
}
