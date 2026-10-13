'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { authClient } from '@/client/auth';
import { fetchJson } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { Icon } from '@iconify/react/offline';
import userIcon from '@iconify-icons/lucide/user-round';
import shieldIcon from '@iconify-icons/lucide/shield-check';
import '@/features/workspace/components/workspace-index.css';

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
      <Button type="submit" variant="primary" disabled={pending || draft.trim() === savedName}>
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
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? '修改中…' : '修改密码'}
      </Button>
    </form>
  );
}

export function Settings() {
  const [tab, setTab] = useState('profile');

  const { data: session, isPending, error, refetch } = authClient.useSession();
  const accounts = useSWR<{ providerId: string }[]>(
    session ? '/api/auth/list-accounts' : null,
    fetchJson,
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header className="space-y-2">
        <h1 className="text-base font-semibold">设置</h1>
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
          <h2 className="text-sm font-semibold">登录后管理账户</h2>
          <p className="text-sm text-page-muted">登录后可以修改姓名和密码。</p>
          <Link
            href="/login?callbackURL=%2Fsettings"
            className={buttonStyles({ className: 'inline-flex' })}
          >
            登录
          </Link>
        </section>
      ) : (
        <Tabs.Root
          key={session.user.id}
          value={tab}
          onValueChange={(value) => setTab(String(value))}
          orientation="vertical"
          className="grid gap-6 md:grid-cols-[180px_minmax(0,1fr)] md:gap-10"
        >
          <Tabs.List
            aria-label="设置分类"
            className="flex gap-1 border-b border-page-line pb-3 md:flex-col md:self-start md:border-b-0 md:border-r md:pr-4"
          >
            <Tabs.Tab
              value="profile"
              className="flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-page-muted hover:bg-surface-muted data-[active]:bg-surface-muted data-[active]:font-medium data-[active]:text-ink"
            >
              <Icon icon={userIcon} width="16" aria-hidden="true" />
              账户资料
            </Tabs.Tab>
            <Tabs.Tab
              value="security"
              className="flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-page-muted hover:bg-surface-muted data-[active]:bg-surface-muted data-[active]:font-medium data-[active]:text-ink"
            >
              <Icon icon={shieldIcon} width="16" aria-hidden="true" />
              登录安全
            </Tabs.Tab>
          </Tabs.List>
          <div className="min-w-0 max-w-xl">
            <Tabs.Panel value="profile" keepMounted>
              <section aria-labelledby="profile-title" className="space-y-6">
                <h2 id="profile-title" className="text-sm font-semibold">
                  账户资料
                </h2>
                <ProfileForm name={session.user.name} email={session.user.email} />
              </section>
            </Tabs.Panel>
            <Tabs.Panel value="security" keepMounted>
              <section aria-labelledby="security-title" className="space-y-6">
                <h2 id="security-title" className="text-sm font-semibold">
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
            </Tabs.Panel>
          </div>
        </Tabs.Root>
      )}
    </div>
  );
}
