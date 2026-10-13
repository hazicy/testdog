'use client';

import clsx from 'clsx';

import styles from './UserMenu.module.css';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/client/auth';
import { Button } from '@/components/ui/Button';

export function UserMenu({ collapsed }: { collapsed: boolean }) {
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
      setError('退出失败，请重试');
      setSigningOut(false);
    }
  }

  if (isPending) return <p className={styles.loading}>加载账号…</p>;
  if (!session)
    return (
      <Link href="/login" className={styles.signIn}>
        登录
      </Link>
    );

  return (
    <div className={styles.menu}>
      <div className={clsx(styles.profile, { [styles.expandedProfile]: !collapsed })}>
        <span className={styles.avatar} title={session.user.name}>
          {session.user.name.slice(0, 1).toUpperCase()}
        </span>
        {!collapsed && (
          <div className={styles.details}>
            <p className={styles.name}>{session.user.name}</p>
            <p className={styles.email} title={session.user.email}>
              {session.user.email}
            </p>
          </div>
        )}
      </div>
      <Button className={styles.signOut} disabled={signingOut} onClick={signOut}>
        {signingOut ? '退出中…' : '退出'}
      </Button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
