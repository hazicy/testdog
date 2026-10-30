'use client';

import { useTranslations } from 'next-intl';

import styles from './AuthForm.module.css';

import { useState, type SubmitEvent } from 'react';
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
  oauthError?: string | string[];
}) {
  const t = useTranslations('auth');
  const router = useRouter();
  const register = mode === 'register';
  const destination = safeCallbackURL(callbackURL);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(
    oauthError
      ? t(
          (Array.isArray(oauthError) ? oauthError : [oauthError]).includes('account_not_linked')
            ? 'accountNotLinked'
            : 'oauthIncomplete',
        )
      : '',
  );

  async function submit(event: SubmitEvent<HTMLFormElement>) {
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
        setError(register ? t('registrationFailed') : t('loginFailed'));
        setPending(false);

        return;
      }

      router.replace(destination);
      router.refresh();
    } catch {
      setError(t('connectionFailed'));
      setPending(false);
    }
  }

  async function social(provider: 'google' | 'github') {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: destination,
        errorCallbackURL: '/login?error=oauth&callbackURL=' + encodeURIComponent(destination),
      });

      if (result.error) {
        setError(t('oauthUnavailable'));
        setPending(false);
      }
    } catch {
      setError(t('connectionFailed'));
      setPending(false);
    }
  }

  return (
    <main id="main-content" className={styles.mainContent}>
      <div className={styles.page}>
        <Link href="/" aria-label={t('home')}>
          <Brand />
        </Link>
        <div>
          <h1 className={styles.title}>{register ? t('createAccount') : t('signInTitle')}</h1>
          <p className={styles.subtitle}>{register ? t('registerSubtitle') : t('loginSubtitle')}</p>
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
                {t('social', { provider: provider === 'google' ? 'Google' : 'GitHub' })}
              </Button>
            ))}
            <p className={styles.providerDivider}>{t('orEmail')}</p>
          </div>
        )}
        <form onSubmit={submit} className={styles.credentials}>
          {register && (
            <label className={styles.field}>
              <span>{t('name')}</span>
              <Input name="name" autoComplete="name" required maxLength={100} disabled={pending} />
            </label>
          )}
          <label className={styles.field}>
            <span>{t('email')}</span>
            <Input name="email" type="email" autoComplete="email" required disabled={pending} />
          </label>
          <label className={styles.field}>
            <span>{t('password')}</span>
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
              {t('passwordHint')}
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
            {pending ? t('pending') : register ? t('register') : t('login')}
          </Button>
        </form>
        <p className={styles.accountPrompt}>
          {register ? t('existingAccount') : t('newAccount')}{' '}
          <Link
            className={styles.accountLink}
            href={
              (register ? '/login' : '/register') +
              '?callbackURL=' +
              encodeURIComponent(destination)
            }
          >
            {register ? t('login') : t('register')}
          </Link>
        </p>
      </div>
    </main>
  );
}
