'use client';

import clsx from 'clsx';

import studioStyles from '@/features/runs/components/run-studio.module.css';
import shellStyles from '@/components/shell/app-shell.module.css';
import styles from './AppShell.module.css';
import workspaceStyles from '@/features/workspace/components/workspace-index.module.css';

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
      <main id="main-content" tabIndex={-1} className={studioStyles.runStudioMain}>
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
    <div className={shellStyles.appShell} data-collapsed={collapsed}>
      <a href="#main-content" className={styles.skipLink}>
        跳转到主内容
      </a>
      <aside className={shellStyles.appShellSidebar}>
        <Link href="/" className={shellStyles.appShellBrand} aria-label="testdog 首页">
          <span className={styles.compactBrand}>
            <Brand compact />
          </span>
          <span className={styles.desktopBrand}>
            <Brand compact={collapsed} />
          </span>
        </Link>
        <div className={shellStyles.appShellNavigation}>
          <nav aria-label="工作区导航" className={styles.navigationItems}>
            {workspaceNavigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={item.name}
                aria-label={item.name}
                aria-current={item === activeItem ? 'page' : undefined}
                className={clsx(
                  styles.navigationLink,
                  item === activeItem ? styles.activeLink : styles.inactiveLink,
                )}
              >
                <Icon icon={item.icon} width="18" aria-hidden="true" />
                {!collapsed && <span className={styles.navigationLabel}>{item.name}</span>}
              </Link>
            ))}
          </nav>
        </div>
        <div className={shellStyles.appShellAccount}>
          <UserMenu collapsed={collapsed} />
        </div>
      </aside>
      <div className={shellStyles.appShellContent}>
        <header className={shellStyles.appShellHeader}>
          <Button
            variant="ghost"
            size="icon"
            className={styles.sidebarToggle}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            aria-expanded={!collapsed}
          >
            <Icon icon={menuIcon} width="18" aria-hidden="true" />
          </Button>
          <nav aria-label="面包屑" className={styles.breadcrumbs}>
            <Link href="/cases" className={styles.breadcrumbLink}>
              工作区
            </Link>
            <Icon icon={chevronIcon} className={styles.separator} width="14" aria-hidden="true" />
            {canvas ? (
              <>
                <Link href="/cases" className={styles.breadcrumbLink}>
                  测试用例
                </Link>
                <Icon
                  icon={chevronIcon}
                  className={styles.separator}
                  width="14"
                  aria-hidden="true"
                />
                <span aria-current="page" className={styles.currentPage}>
                  画板
                </span>
              </>
            ) : (
              <span aria-current="page" className={styles.currentPage}>
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
              ? clsx(shellStyles.appShellMain, shellStyles.appShellMainCanvas)
              : workspaceIndex
                ? clsx(shellStyles.appShellMain, workspaceStyles.workspaceIndexMain)
                : clsx(shellStyles.appShellMain, shellStyles.appShellMainPadded)
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
