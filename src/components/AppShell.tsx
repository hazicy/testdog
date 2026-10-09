'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { WorkspaceIcon } from './WorkspaceIcon';

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  if (pathname === '/' || pathname === '/onboarding') return children;
  const results = pathname.startsWith('/runs');
  return (
    <div
      className={`workspace-shell grid min-h-dvh grid-cols-[60px_minmax(0,1fr)] ${collapsed ? 'md:grid-cols-[60px_minmax(0,1fr)]' : 'md:grid-cols-[232px_minmax(0,1fr)]'}`}
    >
      <a
        href="#main-content"
        className="sr-only z-50 bg-[#faf9f6] p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        跳转到主内容
      </a>
      <aside className="sticky top-0 flex h-dvh flex-col border-r border-[#e2e1da] bg-[#f3f2eb]">
        <Link
          href="/"
          className="flex h-14 shrink-0 items-center gap-3 border-b border-[#e2e1da] px-4"
          aria-label="CaseForge 首页"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center bg-transparent text-brand text-2xl font-semibold -rotate-45">
            ↳
          </span>
          {!collapsed && (
            <span className="hidden text-xl font-bold tracking-[-1px] md:block">caseforge.</span>
          )}
        </Link>
        <div className="px-3 pt-9">
          <div className="mb-6 flex items-center gap-3 px-2 text-sm">
            <WorkspaceIcon name="globe" />
            {!collapsed && <span className="hidden font-medium md:block">浏览器测试工作区</span>}
          </div>
          <nav aria-label="工作区导航" className="space-y-2">
            {[
              { href: '/cases', name: 'Tests', icon: 'tests' as const, active: !results },
              { href: '/runs', name: 'Results', icon: 'results' as const, active: results },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={item.name}
                aria-label={item.name}
                aria-current={item.active ? 'page' : undefined}
                className={`flex h-11 items-center gap-3 px-2 text-sm hover:bg-[#eeece3] ${item.active ? 'bg-[#eeece3] font-medium border-l-2 border-brand' : ''}`}
              >
                <WorkspaceIcon name={item.icon} />
                {!collapsed && <span className="hidden md:block">{item.name}</span>}
              </Link>
            ))}
          </nav>
        </div>
        {!collapsed && (
          <div className="mx-3 mt-auto mb-4 hidden border border-[#e2e1da] bg-[#faf9f6] p-3 md:block">
            <p className="text-xs font-medium">
              从你的第一个测试开始 <span className="float-right text-[#f16b43]">↗</span>
            </p>
            <p className="mt-2 text-[11px] leading-5 text-[#858585]">
              描述操作步骤，让 AI 在真实浏览器中验证。
            </p>
            <div className="mt-3 flex gap-1">
              <span className="h-1 flex-1 bg-[#f16b43]" />
              <span className="h-1 flex-1 bg-[#ead8c6]" />
              <span className="h-1 flex-1 bg-[#ead8c6]" />
            </div>
          </div>
        )}
        <div
          className={`${collapsed ? 'mt-auto' : 'max-md:mt-auto'} border-t border-[#e2e1da] p-3`}
        >
          <div className="flex items-center gap-3 border border-[#e2e1da] bg-[#faf9f6] p-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center bg-[#f3e2d1] text-xs font-medium text-[#8b5129]">
              L
            </span>
            {!collapsed && (
              <div className="hidden min-w-0 md:block">
                <p className="text-xs font-medium">本地工作区</p>
                <p className="mt-0.5 text-[10px] text-[#858585]">Local workspace</p>
              </div>
            )}
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex h-14 items-center gap-3 border-b border-[#e2e1da] bg-[#faf9f6] px-5 md:px-7">
          <button
            className="ws-icon-button hidden md:flex"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            aria-expanded={!collapsed}
          >
            <WorkspaceIcon name="menu" />
          </button>
          <Link href="/" className="text-sm text-[#78796f]">
            Workspace
          </Link>
          <WorkspaceIcon name="chevron" className="text-[#98998b]" width="14" />
          <span className="truncate text-sm">浏览器测试工作区</span>
          <span className="ml-auto hidden border border-[#e2e1da] px-2 py-1 text-[10px] text-[#78796f] sm:block">
            CASEFORGE / 001
          </span>
        </header>
        <main id="main-content" tabIndex={-1} className="px-5 py-9 md:px-9 md:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}
