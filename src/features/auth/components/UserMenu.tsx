'use client';

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

  if (isPending) return <p className="text-xs text-sidebar-muted">加载账号…</p>;
  if (!session)
    return (
      <Link href="/login" className="text-sm text-brand-active">
        登录
      </Link>
    );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 border border-page-line bg-page p-2">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center bg-avatar-surface text-xs font-medium text-avatar-ink"
          title={session.user.name}
        >
          {session.user.name.slice(0, 1).toUpperCase()}
        </span>
        {!collapsed && (
          <div className="hidden min-w-0 md:block">
            <p className="truncate text-xs font-medium">{session.user.name}</p>
            <p className="mt-0.5 truncate text-xs text-sidebar-muted" title={session.user.email}>
              {session.user.email}
            </p>
          </div>
        )}
      </div>
      <Button className="w-full justify-center text-xs" disabled={signingOut} onClick={signOut}>
        {signingOut ? '退出中…' : '退出'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
