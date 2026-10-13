'use client';

import { UserMenu } from '@/features/auth/components/UserMenu';
import { Brand } from '@/components/brand/Brand';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Icon } from '@iconify/react/offline';
import chevronIcon from '@iconify-icons/lucide/chevron-right';
import menuIcon from '@iconify-icons/lucide/panel-left';
import { activeWorkspaceNavigation, workspaceNavigation } from '@/components/shell/navigation';

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  if (
    pathname === '/' ||
    pathname === '/onboarding' ||
    pathname === '/login' ||
    pathname === '/register'
  )
    return children;
  if (/^\/runs\/[^/]+$/.test(pathname)) {
    return (
      <main id="main-content" tabIndex={-1} className="run-studio-main">
        {children}
      </main>
    );
  }

  const activeItem = activeWorkspaceNavigation(pathname);
  const canvas = pathname.startsWith('/cases/editor/');
  const workspaceIndex =
    pathname === '/cases' ||
    pathname === '/runs' ||
    pathname === '/issues' ||
    pathname === '/integrations' ||
    pathname === '/settings';

  return (
    <div
      className={`bg-page text-ink text-sm grid h-dvh overflow-hidden grid-cols-[60px_minmax(0,1fr)] ${collapsed ? 'md:grid-cols-[60px_minmax(0,1fr)]' : 'md:grid-cols-[216px_minmax(0,1fr)]'}`}
    >
      <a
        href="#main-content"
        className="sr-only z-50 bg-page p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        跳转到主内容
      </a>
      <aside className="flex min-h-0 flex-col border-r border-page-line bg-page">
        <Link
          href="/"
          className="flex h-14 shrink-0 items-center gap-3 border-b border-page-line px-4"
          aria-label="testdog 首页"
        >
          <span className="md:hidden">
            <Brand compact />
          </span>
          <span className="hidden md:inline-flex">
            <Brand compact={collapsed} />
          </span>
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-6">
          <nav aria-label="工作区导航" className="space-y-1">
            {workspaceNavigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={item.name}
                aria-label={item.name}
                aria-current={item === activeItem ? 'page' : undefined}
                className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm hover:bg-sidebar-hover ${item === activeItem ? 'bg-badge-surface font-medium text-ink' : 'text-text-secondary'}`}
              >
                <Icon icon={item.icon} width="18" aria-hidden="true" />
                {!collapsed && <span className="hidden md:block">{item.name}</span>}
              </Link>
            ))}
          </nav>
        </div>
        <div className={`shrink-0 border-t border-page-line p-3`}>
          <UserMenu collapsed={collapsed} />
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-page-line bg-surface px-5 md:px-7">
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            aria-expanded={!collapsed}
          >
            <Icon icon={menuIcon} width="18" aria-hidden="true" />
          </Button>
          <nav aria-label="面包屑" className="flex min-w-0 items-center gap-3 text-sm">
            <Link href="/cases" className="text-page-muted">
              工作区
            </Link>
            <Icon icon={chevronIcon} className="text-text-subtle" width="14" aria-hidden="true" />
            {canvas ? (
              <>
                <Link href="/cases" className="text-page-muted">
                  测试用例
                </Link>
                <Icon
                  icon={chevronIcon}
                  className="text-text-subtle"
                  width="14"
                  aria-hidden="true"
                />
                <span aria-current="page" className="truncate">
                  画板
                </span>
              </>
            ) : (
              <span aria-current="page" className="truncate">
                {activeItem?.name ?? '页面不存在'}
              </span>
            )}
          </nav>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={
            canvas
              ? 'min-h-0 flex-1 overflow-hidden'
              : workspaceIndex
                ? 'workspace-index-main min-h-0 flex-1 overflow-auto'
                : 'min-h-0 flex-1 overflow-auto px-4 py-7 sm:px-6 md:px-8 md:py-9'
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
