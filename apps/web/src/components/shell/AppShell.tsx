'use client';

import { TeamSwitcher } from '@/features/teams/components/TeamSwitcher';

import { useTranslations } from 'next-intl';

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
  const t = useTranslations('ui');
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
  const suites =
    pathname === '/cases' ||
    pathname.startsWith('/cases/') ||
    pathname === '/suites' ||
    pathname.startsWith('/suites/');
  const workspaceIndex =
    pathname === '/cases' ||
    pathname === '/runs' ||
    pathname === '/issues' ||
    pathname === '/integrations' ||
    pathname === '/plugins' ||
    pathname === '/settings';

  return (
    <div className={shellStyles.appShell} data-collapsed={collapsed}>
      <a href="#main-content" className={styles.skipLink}>
        {t('skip_to_main_content')}
      </a>
      <aside className={shellStyles.appShellSidebar}>
        <Link href="/" className={shellStyles.appShellBrand} aria-label={t('testdog_home')}>
          <span className={styles.compactBrand}>
            <Brand compact />
          </span>
          <span className={styles.desktopBrand}>
            <Brand compact={collapsed} />
          </span>
        </Link>
        <div className={shellStyles.appShellNavigation}>
          <TeamSwitcher collapsed={collapsed} />
          <nav aria-label={t('workspace_navigation')} className={styles.navigationItems}>
            {workspaceNavigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={t(item.key)}
                aria-label={t(item.key)}
                aria-current={item === activeItem ? 'page' : undefined}
                className={clsx(
                  styles.navigationLink,
                  item === activeItem ? styles.activeLink : styles.inactiveLink,
                )}
              >
                <Icon icon={item.icon} width="18" aria-hidden="true" />
                {!collapsed && <span className={styles.navigationLabel}>{t(item.key)}</span>}
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
            aria-label={collapsed ? t('expand_sidebar') : t('collapse_sidebar')}
            aria-expanded={!collapsed}
          >
            <Icon icon={menuIcon} width="18" aria-hidden="true" />
          </Button>
          <nav aria-label={t('breadcrumbs')} className={styles.breadcrumbs}>
            {canvas ? (
              <>
                <Link href="/cases" className={styles.breadcrumbLink}>
                  {t('test_cases')}
                </Link>
                <Icon
                  icon={chevronIcon}
                  className={styles.separator}
                  width="14"
                  aria-hidden="true"
                />
                <span aria-current="page" className={styles.currentPage}>
                  {t('canvas')}
                </span>
              </>
            ) : (
              <span aria-current="page" className={styles.currentPage}>
                {activeItem ? t(activeItem.key) : t('page_not_found')}
              </span>
            )}
          </nav>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={
            suites
              ? clsx(shellStyles.appShellMain, styles.suiteMain)
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
