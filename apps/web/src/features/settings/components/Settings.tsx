'use client';

import { useTranslations } from 'next-intl';

import styles from './Settings.module.css';
import { PageHeader } from '@/components/shared/PageHeader';
import { SectionHeader } from '@/components/shared/SectionHeader';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { authClient } from '@/client/auth';
import { fetchJson } from '@/client/api';
import { useToastManager } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@base-ui/react/tabs';
import { Icon } from '@iconify/react/offline';
import userIcon from '@iconify-icons/lucide/user-round';
import shieldIcon from '@iconify-icons/lucide/shield-check';
import settingsIcon from '@iconify-icons/lucide/settings-2';
import { TeamSettings } from '@/features/teams/components/TeamSettings';
import { GeneralSettings } from './GeneralSettings';

function ProfileForm({ name, email }: { name: string; email: string }) {
  const t = useTranslations('ui');
  const [draft, setDraft] = useState(name);
  const [savedName, setSavedName] = useState(name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const toastManager = useToastManager();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError('');

    const value = draft.trim();

    if (!value) {
      setError(t('enter_your_name'));

      return;
    }

    setPending(true);
    try {
      const result = await authClient.updateUser({ name: value });

      if (result.error) {
        setError(t('could_not_save_your_profile_please_try_again'));

        return;
      }

      setDraft(value);
      setSavedName(value);
      toastManager.add({ title: t('profile_saved'), type: 'success' });
    } catch {
      setError(t('unable_to_connect_please_try_again'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className={styles.form}>
      <label className={styles.field}>
        <span>{t('name')}</span>
        <Input
          name="name"
          autoComplete="name"
          required
          maxLength={100}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          disabled={pending}
        />
      </label>
      <label className={styles.field}>
        <span>{t('email')}</span>
        <Input value={email} type="email" autoComplete="email" readOnly />
      </label>
      <p className={styles.description}>
        {t('your_email_is_used_to_sign_in_and_cannot_be_changed')}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={pending || draft.trim() === savedName}>
        {pending ? t('saving') : t('save_profile')}
      </Button>
    </form>
  );
}

function PasswordForm() {
  const t = useTranslations('ui');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const toastManager = useToastManager();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get('currentPassword'));
    const newPassword = String(data.get('newPassword'));

    setError('');

    if (newPassword !== data.get('confirmPassword')) {
      setError(t('the_new_passwords_do_not_match'));

      return;
    }

    if (newPassword === currentPassword) {
      setError(t('choose_a_password_different_from_your_current_password'));

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
            ? t('incorrect_current_password_please_try_again')
            : result.error.status === 401
              ? t('your_session_has_expired_sign_in_again_to_change_your_password')
              : t('could_not_change_your_password_check_your_current_password_or_try_again_later'),
        );

        return;
      }

      form.reset();
      toastManager.add({
        title: t('password_changed_other_devices_have_been_signed_out'),
        type: 'success',
      });
    } catch {
      setError(t('unable_to_connect_please_try_again'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className={styles.form}>
      <label className={styles.field}>
        <span>{t('current_password')}</span>
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
        <span>{t('new_password')}</span>
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
        {t('use_8_128_characters_other_devices_will_be_signed_out')}
      </p>
      <label className={styles.field}>
        <span>{t('confirm_new_password')}</span>
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
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? t('updating') : t('change_password')}
      </Button>
    </form>
  );
}

function SocialAccounts({
  providers,
  accounts,
}: {
  providers: ('google' | 'github')[];
  accounts: { providerId: string }[];
}) {
  const t = useTranslations('auth');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function link(provider: 'google' | 'github') {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const result = await authClient.linkSocial({
        provider,
        callbackURL: '/settings',
        errorCallbackURL: '/login?error=oauth&callbackURL=%2Fsettings',
      });

      if (!result.error) return;
      setError(t('oauthUnavailable'));
    } catch {
      setError(t('connectionFailed'));
    }

    setPending(false);
  }

  return (
    <div className={styles.form}>
      {providers.map((provider) => {
        const linked = accounts.some((account) => account.providerId === provider);

        return (
          <Button key={provider} disabled={pending || linked} onClick={() => link(provider)}>
            {t(linked ? 'providerLinked' : 'linkProvider', {
              provider: provider === 'github' ? 'GitHub' : 'Google',
            })}
          </Button>
        );
      })}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

export function Settings({
  initialTheme,
  providers = [],
  invitation,
  teamTab,
}: {
  initialTheme: string;
  providers?: ('google' | 'github')[];
  invitation?: string;
  teamTab?: boolean;
}) {
  const t = useTranslations('ui');
  const general = useTranslations('preferences');
  const team = useTranslations('teams');
  const [tab, setTab] = useState(invitation || teamTab ? 'team' : 'general');

  const { data: session, isPending, error, refetch } = authClient.useSession();
  const accounts = useSWR<{ providerId: string }[]>(
    session ? '/api/auth/list-accounts' : null,
    fetchJson,
  );

  const accountState = isPending ? (
    <p role="status" className={styles.sessionLoading}>
      {t('loading_account')}
    </p>
  ) : error ? (
    <div className={styles.sessionError}>
      <p role="alert" className={styles.error}>
        {t('could_not_load_your_account_please_try_again')}
      </p>
      <Button onClick={() => refetch()}>{t('reload')}</Button>
    </div>
  ) : !session ? (
    <section aria-label={t('account_settings')} className={styles.section}>
      <h2 className={styles.heading}>{t('sign_in_to_manage_your_account')}</h2>
      <p className={styles.sessionLoading}>{t('sign_in_to_change_your_name_and_password')}</p>
      <Link
        href="/login?callbackURL=%2Fsettings"
        className={buttonStyles({ className: styles.link })}
      >
        {t('sign_in')}
      </Link>
    </section>
  ) : null;

  return (
    <div className={styles.container}>
      <PageHeader title={t('settings')} />
      <Tabs.Root
        value={tab}
        onValueChange={(value) => setTab(String(value))}
        orientation="vertical"
        className={styles.root}
      >
        <Tabs.List aria-label={t('settings_categories')} className={styles.list}>
          <Tabs.Tab value="general" className={styles.tab}>
            <Icon icon={settingsIcon} width="16" aria-hidden="true" />
            {general('title')}
          </Tabs.Tab>
          <Tabs.Tab value="profile" className={styles.tab}>
            <Icon icon={userIcon} width="16" aria-hidden="true" />
            {t('profile')}
          </Tabs.Tab>
          <Tabs.Tab value="security" className={styles.tab}>
            <Icon icon={shieldIcon} width="16" aria-hidden="true" />
            {t('security')}
          </Tabs.Tab>
          <Tabs.Tab value="team" className={styles.tab}>
            <Icon icon={userIcon} width="16" aria-hidden="true" />
            {team('title')}
          </Tabs.Tab>
        </Tabs.List>
        <div className={styles.panels}>
          <Tabs.Panel value="team" keepMounted>
            {session ? <TeamSettings invitation={invitation} /> : accountState}
          </Tabs.Panel>
          <Tabs.Panel value="general" keepMounted>
            <GeneralSettings initialTheme={initialTheme} />
          </Tabs.Panel>
          <Tabs.Panel value="profile" keepMounted>
            {session ? (
              <section aria-labelledby="profile-title" className={styles.settingsSection}>
                <SectionHeader id="profile-title" title={t('profile')} />
                <ProfileForm
                  key={session.user.id}
                  name={session.user.name}
                  email={session.user.email}
                />
              </section>
            ) : (
              accountState
            )}
          </Tabs.Panel>
          <Tabs.Panel value="security" keepMounted>
            {session ? (
              <section aria-labelledby="security-title" className={styles.settingsSection}>
                <SectionHeader id="security-title" title={t('security')} />
                {accounts.data && <SocialAccounts providers={providers} accounts={accounts.data} />}
                {accounts.error ? (
                  <div className={styles.sessionError}>
                    <p role="alert" className={styles.error}>
                      {t('could_not_load_sign_in_methods_please_try_again')}
                    </p>
                    <Button onClick={() => accounts.mutate()}>{t('reload_sign_in_methods')}</Button>
                  </div>
                ) : !accounts.data ? (
                  <p role="status" className={styles.sessionLoading}>
                    {t('loading_sign_in_methods')}
                  </p>
                ) : accounts.data.some((account) => account.providerId === 'credential') ? (
                  <PasswordForm />
                ) : (
                  <p className={styles.providerHint}>
                    {t(
                      'manage_your_password_through_the_google_or_github_account_you_use_to_sign_in',
                    )}
                  </p>
                )}
              </section>
            ) : (
              accountState
            )}
          </Tabs.Panel>
        </div>
      </Tabs.Root>
    </div>
  );
}
