'use client';

import styles from './Settings.module.css';

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
    <form onSubmit={save} className={styles.form}>
      <label className={styles.field}>
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
      <label className={styles.field}>
        <span>邮箱</span>
        <Input value={email} type="email" autoComplete="email" readOnly />
      </label>
      <p className={styles.description}>邮箱用于登录，目前暂不支持修改。</p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {message && (
        <p role="status" className={styles.loading}>
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
    <form onSubmit={save} className={styles.form}>
      <label className={styles.field}>
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
      <label className={styles.field}>
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
      <p id="new-password-hint" className={styles.description}>
        使用 8–128 个字符。修改后将退出其他设备的登录。
      </p>
      <label className={styles.field}>
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
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {message && (
        <p role="status" className={styles.loading}>
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
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>设置</h1>
      </header>
      {isPending ? (
        <p role="status" className={styles.sessionLoading}>
          加载账户…
        </p>
      ) : error ? (
        <div className={styles.sessionError}>
          <p role="alert" className={styles.error}>
            账户信息加载失败，请重试。
          </p>
          <Button onClick={() => refetch()}>重新加载</Button>
        </div>
      ) : !session ? (
        <section aria-label="账户设置" className={styles.section}>
          <h2 className={styles.heading}>登录后管理账户</h2>
          <p className={styles.sessionLoading}>登录后可以修改姓名和密码。</p>
          <Link
            href="/login?callbackURL=%2Fsettings"
            className={buttonStyles({ className: styles.link })}
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
          className={styles.root}
        >
          <Tabs.List aria-label="设置分类" className={styles.list}>
            <Tabs.Tab value="profile" className={styles.tab}>
              <Icon icon={userIcon} width="16" aria-hidden="true" />
              账户资料
            </Tabs.Tab>
            <Tabs.Tab value="security" className={styles.tab}>
              <Icon icon={shieldIcon} width="16" aria-hidden="true" />
              登录安全
            </Tabs.Tab>
          </Tabs.List>
          <div className={styles.panels}>
            <Tabs.Panel value="profile" keepMounted>
              <section aria-labelledby="profile-title" className={styles.settingsSection}>
                <h2 id="profile-title" className={styles.heading}>
                  账户资料
                </h2>
                <ProfileForm name={session.user.name} email={session.user.email} />
              </section>
            </Tabs.Panel>
            <Tabs.Panel value="security" keepMounted>
              <section aria-labelledby="security-title" className={styles.settingsSection}>
                <h2 id="security-title" className={styles.heading}>
                  登录安全
                </h2>
                {accounts.error ? (
                  <div className={styles.sessionError}>
                    <p role="alert" className={styles.error}>
                      登录方式加载失败，请重试。
                    </p>
                    <Button onClick={() => accounts.mutate()}>重新加载登录方式</Button>
                  </div>
                ) : !accounts.data ? (
                  <p role="status" className={styles.sessionLoading}>
                    加载登录方式…
                  </p>
                ) : accounts.data.some((account) => account.providerId === 'credential') ? (
                  <PasswordForm />
                ) : (
                  <p className={styles.providerHint}>
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
