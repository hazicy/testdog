'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/client/api';
import { useRunSubmission } from '@/client/useRunSubmission';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogHeader, DialogFooter } from '@/components/ui/Dialog';
import { writeCaseDraft } from '@/features/test-cases/lib/caseDraft';
import { emptyPlan } from '@/features/test-cases/lib/authoring';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import { LoginIdentityForm } from '@/features/login-identities/components/LoginIdentityForm';
import type { LoginIdentityDraft } from '@/features/login-identities/draft';
import type { LoginIdentity } from '@testdog/contracts/login-identities/types';
import { identityStatuses, verificationHint } from '@/features/login-identities/presentation';
import {
  useLoginIdentities,
  useResumedIdentityDraft,
} from '@/features/login-identities/hooks/useLoginIdentities';

export function LoginIdentities() {
  const { data, error, mutate } = useLoginIdentities();
  const [resumed, setResumed] = useResumedIdentityDraft();
  const submit = useRunSubmission();
  const router = useRouter();
  const deleteTitle = useId();
  const [form, setForm] = useState<LoginIdentityDraft | 'new'>();
  const [deleting, setDeleting] = useState<LoginIdentity>();
  const [busy, setBusy] = useState<string>();
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!data) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get('loginIdentity');

    if (!id) return;
    const frame = requestAnimationFrame(() => {
      const identity = data.identities.find((item) => item.id === id);

      if (identity) setForm({ ...identity });
      else setActionError('登录身份不存在或无权访问，请重新选择。');
      url.searchParams.delete('loginIdentity');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    });

    return () => cancelAnimationFrame(frame);
  }, [data]);

  async function openCase(id: string) {
    setBusy(id);
    setActionError('');
    try {
      const { test } = await api.get(`/api/tests/${id}`).json<{ test: TestCase }>();
      const key = crypto.randomUUID();

      writeCaseDraft(key, {
        test,
        name: test.name,
        url: test.url,
        goal: test.goal,
        plan: test.plan ?? emptyPlan(test.name),
      });
      router.push(`/cases/editor/${key}`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '无法打开用例。');
    } finally {
      setBusy(undefined);
    }
  }

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
      if (kind === 'delete') setDeleting(undefined);
      await mutate();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '操作失败');
    } finally {
      setBusy(undefined);
    }
  }

  function dismissForm() {
    setForm(undefined);
    setResumed(undefined);
  }

  return (
    <section aria-labelledby="login-identities-title" className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="login-identities-title" className="text-sm font-semibold">
          登录身份
        </h2>
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={!data || !!busy}
          onClick={() => {
            setMessage('');
            setForm('new');
          }}
        >
          新建登录身份
        </Button>
      </div>
      <p className="text-sm text-page-muted">
        保存账号和登录流程，在多个 Web 用例中复用。每次执行前会检查登录状态，失效时自动重新登录。
      </p>
      {(error || actionError) && (
        <p role="alert" className="text-sm text-error-ink">
          {actionError || '登录身份加载失败。'}
          {error && (
            <Button type="button" size="sm" onClick={() => void mutate()}>
              重试
            </Button>
          )}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-step-success">
          {message}
        </p>
      )}
      {!data ? (
        !error && <p role="status">正在加载登录身份…</p>
      ) : !data.identities.length ? (
        <p className="text-sm text-page-muted">
          还没有登录身份。先创建登录流程，再填入账号密码并验证，即可在用例设置中选择。
        </p>
      ) : (
        <div className="divide-y divide-page-line border-y border-page-line">
          {data.identities.map((identity) => (
            <article key={identity.id} className="space-y-3 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium">{identity.name}</h3>
                <span className="text-xs text-page-muted">{identityStatuses[identity.status]}</span>
              </div>
              <p className="text-xs text-page-muted">
                {identity.website} · {identity.references.length} 个用例引用
              </p>
              {identity.lastVerifiedAt && (
                <p className="text-xs text-page-muted">
                  最近验证：{new Date(identity.lastVerifiedAt).toLocaleString('zh-CN')}
                </p>
              )}
              {!!identity.references.length && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-page-muted">
                  <span>关联用例：</span>
                  {identity.references.map((test) => (
                    <button
                      key={test.id}
                      type="button"
                      disabled={!!busy}
                      className="text-brand-active underline"
                      onClick={() => void openCase(test.id)}
                    >
                      {test.name}
                    </button>
                  ))}
                </div>
              )}
              <p
                className={`text-sm ${identity.status === 'failed' ? 'text-error-ink' : 'text-page-muted'}`}
              >
                {verificationHint(identity)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!!busy || identity.status === 'verifying'}
                  onClick={() => {
                    setMessage('');
                    setForm({ ...identity });
                  }}
                >
                  编辑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!!busy || identity.status === 'verifying'}
                  onClick={() => void action(identity.id, 'verify')}
                >
                  重新验证
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!!busy || identity.status === 'verifying'}
                  onClick={() => void action(identity.id, 'clear')}
                >
                  清除登录态
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    !!busy || identity.status === 'verifying' || !!identity.references.length
                  }
                  onClick={() => {
                    setActionError('');
                    setDeleting(identity);
                  }}
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
              {identity.status === 'verifying' ? (
                <p className="text-xs text-page-muted">
                  验证进行中，完成后可编辑、清除登录态或删除。
                </p>
              ) : (
                !!identity.references.length && (
                  <p className="text-xs text-page-muted">
                    请先在关联用例中取消使用此身份，再删除。
                  </p>
                )
              )}
            </article>
          ))}
        </div>
      )}
      {(form || resumed) && data && (
        <LoginIdentityForm
          initial={resumed ?? (form === 'new' ? undefined : form)}
          catalog={data}
          onDismiss={dismissForm}
          onSaved={async (identity, runId) => {
            await mutate(
              {
                ...data,
                identities: [
                  ...data.identities.filter((item) => item.id !== identity.id),
                  {
                    ...identity,
                    status: runId ? 'verifying' : 'unverified',
                    verificationRunId: runId ?? null,
                    verificationStatus: runId ? 'queued' : undefined,
                  },
                ],
              },
              { revalidate: true },
            );
            dismissForm();
            setMessage(
              runId ? '配置已保存，验证已排队。' : '配置已保存，可稍后验证或直接在用例中使用。',
            );
          }}
        />
      )}
      {deleting && (
        <Dialog titleId={deleteTitle} busy={!!busy} onDismiss={() => setDeleting(undefined)}>
          <DialogHeader>
            <h2 id={deleteTitle}>删除登录身份？</h2>
          </DialogHeader>
          <div className="space-y-3 p-6">
            <p>将删除“{deleting.name}”及其保存的密码和登录态。登录流程与历史执行会保留。</p>
            {actionError && (
              <p role="alert" className="text-error-ink">
                {actionError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" disabled={!!busy} onClick={() => setDeleting(undefined)}>
              取消
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={!!busy}
              onClick={() => void action(deleting.id, 'delete')}
            >
              确认删除
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </section>
  );
}
