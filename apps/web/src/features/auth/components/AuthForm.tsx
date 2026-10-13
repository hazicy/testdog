'use client';

import styles from './AuthForm.module.css';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/client/auth';
import { safeCallbackURL } from '@/features/auth/redirect';
import { Brand } from '@/components/brand/Brand';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function AuthForm({
  mode,
  providers,
  callbackURL,
  oauthError,
}: {
  mode: 'login' | 'register';
  providers: ('google' | 'github')[];
  callbackURL?: string;
  oauthError?: boolean;
}) {
  const router = useRouter();
  const register = mode === 'register';
  const destination = safeCallbackURL(callbackURL);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(oauthError ? '第三方登录未完成，请重试。' : '');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);

    setPending(true);
    setError('');
    try {
      const credentials = {
        email: String(data.get('email')).trim(),
        password: String(data.get('password')),
      };
      const result = register
        ? await authClient.signUp.email({ ...credentials, name: String(data.get('name')).trim() })
        : await authClient.signIn.email(credentials);

      if (result.error) {
        setError(
          register
            ? '注册失败，请检查填写内容或使用已有邮箱登录。'
            : '登录失败，请检查邮箱和密码。',
        );
        setPending(false);

        return;
      }

      router.replace(destination);
      router.refresh();
    } catch {
      setError('暂时无法连接，请稍后重试。');
      setPending(false);
    }
  }

  async function social(provider: 'google' | 'github') {
    setPending(true);
    setError('');
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: destination,
        errorCallbackURL: '/login?error=oauth&callbackURL=' + encodeURIComponent(destination),
      });

      if (result.error) {
        setError('第三方登录暂时不可用，请重试或使用邮箱登录。');
        setPending(false);
      }
    } catch {
      setError('暂时无法连接，请稍后重试。');
      setPending(false);
    }
  }

  return (
    <main id="main-content" className={styles.mainContent}>
      <div className={styles.page}>
        <Link href="/" aria-label="testdog 首页">
          <Brand />
        </Link>
        <div>
          <h1 className={styles.title}>{register ? '创建账号' : '登录 testdog'}</h1>
          <p className={styles.subtitle}>
            {register ? '使用邮箱注册，开始管理和运行测试。' : '登录后继续使用测试工作区。'}
          </p>
        </div>
        {providers.length > 0 && (
          <div className={styles.providers}>
            {providers.map((provider) => (
              <Button
                key={provider}
                className={styles.providerButton}
                disabled={pending}
                onClick={() => social(provider)}
              >
                使用 {provider === 'google' ? 'Google' : 'GitHub'}{' '}
                {register ? '注册 / 登录' : '登录'}
              </Button>
            ))}
            <p className={styles.providerDivider}>或使用邮箱</p>
          </div>
        )}
        <form onSubmit={submit} className={styles.credentials}>
          {register && (
            <label className={styles.field}>
              <span>姓名</span>
              <Input name="name" autoComplete="name" required maxLength={100} disabled={pending} />
            </label>
          )}
          <label className={styles.field}>
            <span>邮箱</span>
            <Input name="email" type="email" autoComplete="email" required disabled={pending} />
          </label>
          <label className={styles.field}>
            <span>密码</span>
            <Input
              name="password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              aria-describedby={register ? 'password-hint' : undefined}
              required
              minLength={register ? 8 : undefined}
              maxLength={128}
              disabled={pending}
            />
          </label>
          {register && (
            <p id="password-hint" className={styles.passwordHint}>
              至少 8 个字符
            </p>
          )}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            className={styles.providerButton}
            disabled={pending}
          >
            {pending ? '请稍候…' : register ? '注册' : '登录'}
          </Button>
        </form>
        <p className={styles.accountPrompt}>
          {register ? '已有账号？' : '还没有账号？'}{' '}
          <Link
            className={styles.accountLink}
            href={
              (register ? '/login' : '/register') +
              '?callbackURL=' +
              encodeURIComponent(destination)
            }
          >
            {register ? '登录' : '注册'}
          </Link>
        </p>
      </div>
    </main>
  );
}
