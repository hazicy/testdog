'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { api, fetchJson } from '@/client/api';
import { useRunSubmission } from '@/client/useRunSubmission';
import { Button } from '@/components/ui/Button';
import { LoginIdentityForm } from './LoginIdentityForm';
import { resumeIdentityDraft, type LoginIdentityDraft } from '../draft';
import type { LoginIdentitiesResponse } from '../types';

const statuses = {
  ready: '可复用',
  unverified: '尚未验证',
  verifying: '正在验证',
  failed: '验证失败',
  expired: '需要重新登录',
};

export function LoginIdentities() {
  const { data, error, mutate } = useSWR<LoginIdentitiesResponse>(
    '/api/login-identities',
    fetchJson,
    {
      refreshInterval: (current) =>
        current?.identities.some((item) => item.status === 'verifying') ? 3000 : 30000,
    },
  );
  const submit = useRunSubmission();
  const [form, setForm] = useState<LoginIdentityDraft | 'new'>();
  const [busy, setBusy] = useState<string>();
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const resumed = resumeIdentityDraft();

      if (resumed) setForm(resumed);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  async function action(id: string, kind: 'verify' | 'clear' | 'delete') {
    setBusy(id);
    setActionError('');
    setMessage('');
    try {
      if (kind === 'verify') await submit(`/api/login-identities/${id}/verify`, {});
      else await api.delete(`/api/login-identities/${id}${kind === 'clear' ? '/cache' : ''}`);
      setMessage(
        kind === 'verify'
          ? '验证已提交，可查看验证执行。'
          : kind === 'clear'
            ? '登录态已清除，下次执行会重新登录。'
            : '登录身份已删除。',
      );
      await mutate();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '操作失败');
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section aria-labelledby="login-identities-title" className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="login-identities-title" className="text-sm font-semibold">
          登录身份
        </h2>
        <Button
          size="sm"
          variant="primary"
          disabled={!data || !!busy}
          onClick={() => setForm('new')}
        >
          新建登录身份
        </Button>
      </div>
      <p className="text-sm text-page-muted">
        创建一次登录流程，让多个 Web
        用例复用。每次执行使用独立浏览器会话；修改同一账号数据的用例建议串行执行。
      </p>
      {(error || actionError) && (
        <p role="alert" className="text-sm text-error-ink">
          {actionError || '登录身份加载失败。'}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-step-success">
          {message}
        </p>
      )}
      {!data ? (
        <p role="status">正在加载登录身份…</p>
      ) : !data.identities.length ? (
        <p className="text-sm text-page-muted">
          还没有登录身份。在这里创建，或从用例设置中直接新建。
        </p>
      ) : (
        <div className="divide-y divide-page-line border-y border-page-line">
          {data.identities.map((identity) => (
            <article key={identity.id} className="space-y-3 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium">{identity.name}</h3>
                <span className="text-xs text-page-muted">{statuses[identity.status]}</span>
              </div>
              <p className="text-xs text-page-muted">
                {identity.website} · {identity.references.length} 个用例引用
              </p>
              {identity.references.length > 0 && (
                <p className="text-xs text-page-muted">
                  关联用例：{identity.references.map((test) => test.name).join('、')}
                </p>
              )}
              {identity.lastError && <p className="text-sm text-error-ink">{identity.lastError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={!!busy || identity.status === 'verifying'}
                  onClick={() => setForm({ ...identity })}
                >
                  编辑
                </Button>
                <Button
                  size="sm"
                  disabled={!!busy || identity.status === 'verifying'}
                  onClick={() => void action(identity.id, 'verify')}
                >
                  重新验证
                </Button>
                <Button
                  size="sm"
                  disabled={!!busy || identity.status === 'verifying'}
                  onClick={() => void action(identity.id, 'clear')}
                >
                  清除登录态
                </Button>
                <Button
                  size="sm"
                  disabled={
                    !!busy || identity.status === 'verifying' || identity.references.length > 0
                  }
                  onClick={() => void action(identity.id, 'delete')}
                >
                  删除
                </Button>
                {identity.verificationRunId && (
                  <Link
                    href={`/runs/${identity.verificationRunId}`}
                    className="self-center text-xs text-brand-active"
                  >
                    查看验证执行
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {form && data && (
        <LoginIdentityForm
          initial={form === 'new' ? undefined : form}
          catalog={data}
          onDismiss={() => setForm(undefined)}
          onSaved={async () => {
            setForm(undefined);
            setMessage('配置已保存并提交验证。');
            await mutate();
          }}
        />
      )}
    </section>
  );
}
