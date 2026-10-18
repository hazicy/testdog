'use client';

import { useTranslations } from 'next-intl';

import clsx from 'clsx';

import styles from './UserMenu.module.css';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/client/auth';
import { Menu } from '@base-ui/react/menu';
import { Icon } from '@iconify/react/offline';
import chevronsIcon from '@iconify-icons/lucide/chevrons-up-down';
import signOutIcon from '@iconify-icons/lucide/log-out';

export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations('ui');
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    setSigningOut(true);
    setError('');
    try {
      const result = await authClient.signOut();

      if (result.error) throw new Error('sign-out');
      router.replace('/login');
      router.refresh();
    } catch {
      setError(t('sign_out_failed_please_try_again'));
      setSigningOut(false);
    }
  }

  if (isPending) return <p className={styles.loading}>{t('loading_account')}</p>;
  if (!session)
    return (
      <Link href="/login" className={styles.signIn}>
        {t('sign_in')}
      </Link>
    );

  return (
    <div className={styles.menu}>
      <Menu.Root>
        <Menu.Trigger
          className={clsx(styles.profile, { [styles.expandedProfile]: !collapsed })}
          aria-label={t('account_menu')}
          aria-busy={signingOut}
          disabled={signingOut}
          title={session.user.name}
        >
          <span className={styles.avatar} aria-hidden="true">
            {session.user.name.slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <span className={styles.details}>
              <span className={styles.name}>{session.user.name}</span>
            </span>
          )}
          {!collapsed && (
            <Icon icon={chevronsIcon} width="16" className={styles.chevron} aria-hidden="true" />
          )}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="top" align="start" sideOffset={8} className={styles.positioner}>
            <Menu.Popup className={styles.popup} aria-label={t('account_menu')}>
              <div className={styles.accountDetails}>
                <p className={styles.name}>{session.user.name}</p>
                <p className={styles.email} title={session.user.email}>
                  {session.user.email}
                </p>
              </div>
              <Menu.Item
                className={styles.signOut}
                disabled={signingOut}
                onClick={() => void signOut()}
              >
                <Icon icon={signOutIcon} width="16" aria-hidden="true" />
                {signingOut ? t('signing_out') : t('sign_out')}
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
