import type { LoginIdentity } from './types';

export const identityStatuses: Record<LoginIdentity['status'], string> = {
  ready: '可复用',
  unverified: '尚未验证',
  verifying: '正在验证',
  failed: '验证失败',
  expired: '需要重新登录',
};

export function verificationHint(identity: LoginIdentity) {
  return identity.status === 'verifying'
    ? identity.verificationStatus === 'queued'
      ? '验证已排队，等待执行。'
      : '正在执行登录验证…'
    : identity.status === 'failed'
      ? identity.lastError || '登录验证未通过，请查看验证执行。'
      : identity.status === 'ready'
        ? '登录验证成功，可在用例中使用。'
        : '执行前会准备登录；失效时自动重新登录。';
}
