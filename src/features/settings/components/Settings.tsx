'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { authClient } from '@/client/auth';
import { fetchJson } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

function ProfileForm({ name, email }: { name: string; email: string }) {
  const [draft, setDraft] = useState(name);
  const [savedName, setSavedName] = useState(name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError('');
    setMessage('');
    const value = draft.trim();

    if (!value) {
      setError('请填写姓名。');

      return;
    }

    setPending(true);
    try {
      const result = await authClient.updateUser({ name: value });

      if (result.error) {
        setError('资料保存失败，请稍后重试。');

        return;
      }

      setDraft(value);
      setSavedName(value);
      setMessage('资料已保存。');
    } catch {
      setError('暂时无法连接，请稍后重试。');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <label className="block space-y-2 text-sm">
        <span>姓名</span>
        <Input
          name="name"
          autoComplete="name"
          required
          maxLength={100}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setMessage('');
          }}
          disabled={pending}
        />
      </label>
      <label className="block space-y-2 text-sm">
        <span>邮箱</span>
        <Input value={email} type="email" autoComplete="email" readOnly />
      </label>
      <p className="text-xs text-page-muted">邮箱用于登录，目前暂不支持修改。</p>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-brand-active">
          {message}
        </p>
      )}
      <Button
        type="submit"
        className="ws-button primary"
        disabled={pending || draft.trim() === savedName}
      >
        {pending ? '保存中…' : '保存资料'}
      </Button>
    </form>
  );
}

function PasswordForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get('currentPassword'));
    const newPassword = String(data.get('newPassword'));

    setError('');
    setMessage('');
    if (newPassword !== data.get('confirmPassword')) {
      setError('两次输入的新密码不一致。');

      return;
    }

    if (newPassword === currentPassword) {
      setError('新密码不能与当前密码相同。');

      return;
    }

    setPending(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });

      if (result.error) {
        setError(
          result.error.code === 'INVALID_PASSWORD'
            ? '当前密码不正确，请重新输入。'
            : result.error.status === 401
              ? '登录已过期，请重新登录后修改密码。'
              : '密码修改失败，请检查当前密码或稍后重试。',
        );

        return;
      }

      form.reset();
      setMessage('密码已修改，其他设备的登录已退出。');
    } catch {
      setError('暂时无法连接，请稍后重试。');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <label className="block space-y-2 text-sm">
        <span>当前密码</span>
        <Input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          disabled={pending}
        />
      </label>
      <label className="block space-y-2 text-sm">
        <span>新密码</span>
        <Input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          aria-describedby="new-password-hint"
          disabled={pending}
        />
      </label>
      <p id="new-password-hint" className="text-xs text-page-muted">
        使用 8–128 个字符。修改后将退出其他设备的登录。
      </p>
      <label className="block space-y-2 text-sm">
        <span>确认新密码</span>
        <Input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          disabled={pending}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-brand-active">
          {message}
        </p>
      )}
      <Button type="submit" className="ws-button primary" disabled={pending}>
        {pending ? '修改中…' : '修改密码'}
      </Button>
    </form>
  );
}

export function Settings() {
  const { data: session, isPending, error, refetch } = authClient.useSession();
  const accounts = useSWR<{ providerId: string }[]>(
    session ? '/api/auth/list-accounts' : null,
    fetchJson,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
        <p className="text-sm text-page-muted">管理账户资料与登录安全。</p>
      </header>
      {isPending ? (
        <p role="status" className="text-sm text-page-muted">
          加载账户…
        </p>
      ) : error ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-red-600">
            账户信息加载失败，请重试。
          </p>
          <Button onClick={() => refetch()}>重新加载</Button>
        </div>
      ) : !session ? (
        <section
          aria-label="账户设置"
          className="space-y-4 rounded-xl border border-page-line bg-page p-6"
        >
          <h2 className="text-lg font-medium">登录后管理账户</h2>
          <p className="text-sm text-page-muted">登录后可以修改姓名和密码。</p>
          <Link href="/login?callbackURL=%2Fsettings" className="ws-button inline-flex">
            登录
          </Link>
        </section>
      ) : (
        <div key={session.user.id} className="space-y-6">
          <section
            aria-labelledby="profile-title"
            className="space-y-6 rounded-xl border border-page-line bg-page p-6 sm:p-8"
          >
            <h2 id="profile-title" className="text-lg font-medium">
              账户资料
            </h2>
            <ProfileForm name={session.user.name} email={session.user.email} />
          </section>
          <section
            aria-labelledby="security-title"
            className="space-y-6 rounded-xl border border-page-line bg-page p-6 sm:p-8"
          >
            <h2 id="security-title" className="text-lg font-medium">
              登录安全
            </h2>
            {accounts.error ? (
              <div className="space-y-3">
                <p role="alert" className="text-sm text-red-600">
                  登录方式加载失败，请重试。
                </p>
                <Button onClick={() => accounts.mutate()}>重新加载登录方式</Button>
              </div>
            ) : !accounts.data ? (
              <p role="status" className="text-sm text-page-muted">
                加载登录方式…
              </p>
            ) : accounts.data.some((account) => account.providerId === 'credential') ? (
              <PasswordForm />
            ) : (
              <p className="text-sm leading-6 text-page-muted">
                此账户使用第三方登录，请前往对应的 Google 或 GitHub 账户管理密码。
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
