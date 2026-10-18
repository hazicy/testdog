'use client';

import { TeamSwitcher } from '@/features/teams/components/TeamSwitcher';

import { useTranslations } from 'next-intl';

import clsx from 'clsx';

import shellStyles from '@/components/shell/app-shell.module.css';
import styles from './AppShell.module.css';

import { UserMenu } from '@/features/auth/components/UserMenu';
import { Brand } from '@/components/brand/Brand';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Icon } from '@iconify/react/offline';
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
  const activeItem = activeWorkspaceNavigation(pathname);
  const studio = /^\/runs\/[^/]+$/.test(pathname);
  const suites =
    pathname === '/cases' ||
    pathname.startsWith('/cases/') ||
    pathname === '/suites' ||
    pathname.startsWith('/suites/');

  return (
    <div className={shellStyles.appShell} data-collapsed={collapsed}>
      <a href="#main-content" className={styles.skipLink}>
        {t('skip_to_main_content')}
      </a>
      <aside className={shellStyles.appShellSidebar}>
        <div className={shellStyles.appShellBrandRow}>
          <Link href="/" className={shellStyles.appShellBrand} aria-label={t('testdog_home')}>
            <span className={styles.compactBrand}>
              <Brand compact />
            </span>
            <span className={styles.desktopBrand}>
              <Brand compact={collapsed} />
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className={styles.sidebarToggle}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t('expand_sidebar') : t('collapse_sidebar')}
            aria-expanded={!collapsed}
          >
            <Icon icon={menuIcon} width="16" aria-hidden="true" />
          </Button>
        </div>
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
                <Icon icon={item.icon} width="16" aria-hidden="true" />
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
        <main
          id="main-content"
          tabIndex={-1}
          className={clsx(
            shellStyles.appShellMain,
            shellStyles.workspaceSurface,
            suites || studio ? styles.workbenchMain : shellStyles.workspacePage,
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
