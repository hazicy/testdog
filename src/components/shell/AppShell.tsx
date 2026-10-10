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
import resultsIcon from '@iconify-icons/lucide/play';
import testsIcon from '@iconify-icons/lucide/flask-conical';

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

  const results = pathname.startsWith('/runs');

  return (
    <div
      className={`workspace-shell grid min-h-dvh grid-cols-[60px_minmax(0,1fr)] ${collapsed ? 'md:grid-cols-[60px_minmax(0,1fr)]' : 'md:grid-cols-[216px_minmax(0,1fr)]'}`}
    >
      <a
        href="#main-content"
        className="sr-only z-50 bg-page p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        跳转到主内容
      </a>
      <aside className="sticky top-0 flex h-dvh flex-col border-r border-page-line bg-sidebar">
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
        <div className="px-3 pt-6">
          <nav aria-label="工作区导航" className="space-y-1">
            {[
              { href: '/cases', name: '测试用例', icon: testsIcon, active: !results },
              { href: '/runs', name: '执行记录', icon: resultsIcon, active: results },
              { href: '/issues', name: '问题追踪', icon: resultsIcon, active: results },
              { href: '/integrations', name: '集成', icon: resultsIcon, active: results },
              { href: '/test-account', name: '测试账号', icon: resultsIcon, active: results },
              { href: '/settings', name: '设置', icon: resultsIcon, active: results },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={item.name}
                aria-label={item.name}
                aria-current={item.active ? 'page' : undefined}
                className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm hover:bg-sidebar-hover ${item.active ? 'bg-surface-raised font-medium text-brand-active shadow-sm' : ''}`}
              >
                <Icon icon={item.icon} width="18" aria-hidden="true" />
                {!collapsed && <span className="hidden md:block">{item.name}</span>}
              </Link>
            ))}
          </nav>
        </div>
        <div className={`mt-auto border-t border-page-line p-3`}>
          <UserMenu collapsed={collapsed} />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex h-14 items-center gap-3 border-b border-page-line bg-page px-5 md:px-7">
          <Button
            className="ws-icon-button hidden md:flex"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            aria-expanded={!collapsed}
          >
            <Icon icon={menuIcon} width="18" aria-hidden="true" />
          </Button>
          <Link href="/" className="text-sm text-page-muted">
            工作区
          </Link>
          <Icon icon={chevronIcon} className="text-text-subtle" width="14" aria-hidden="true" />
          <span className="truncate text-sm">浏览器测试</span>
        </header>
        <main id="main-content" tabIndex={-1} className="px-4 py-7 sm:px-6 md:px-8 md:py-9">
          {children}
        </main>
      </div>
    </div>
  );
}
