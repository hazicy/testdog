'use client';

import { Avatar, Breadcrumbs, Button, Surface } from '@heroui/react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={`grid min-h-dvh grid-cols-[64px_minmax(0,1fr)] ${collapsed ? 'md:grid-cols-[76px_minmax(0,1fr)]' : 'md:grid-cols-[236px_minmax(0,1fr)]'}`}
    >
      <a
        className="sr-only z-50 rounded bg-surface p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        href="#main-content"
      >
        跳转到主内容
      </a>
      <Surface
        render={(props) => <aside {...props} />}
        className="sticky top-0 flex h-dvh flex-col border-r border-border px-2 py-6 md:px-3"
        aria-label="工作区导航"
      >
        <Link
          href="/"
          className="flex items-center gap-3 px-2 text-3xl font-bold tracking-tight"
          aria-label="Play 首页"
        >
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-sm text-accent-foreground"
            aria-hidden="true"
          >
            ▶
          </span>
          {!collapsed && <span className="hidden md:inline">play.</span>}
        </Link>
        <div className="my-8 flex items-center gap-3 px-2">
          <Avatar
            size="sm"
            aria-label="默认工作区"
          >
            <Avatar.Fallback>P</Avatar.Fallback>
          </Avatar>
          {!collapsed && (
            <div className="hidden min-w-0 md:block">
              <p className="text-xs font-semibold">默认工作区</p>
              <p className="mt-1 text-[10px] text-muted">自动化测试平台</p>
            </div>
          )}
        </div>
        <nav
          id="workspace-navigation"
          aria-label="主导航"
        >
          {!collapsed && (
            <p className="mb-3 hidden px-3 text-[10px] tracking-widest text-muted md:block">
              WORKSPACE
            </p>
          )}
          <Link
            href="/"
            aria-current="page"
            aria-label="测试用例"
            title="测试用例"
            className="flex min-h-11 items-center gap-3 rounded-lg bg-accent/10 px-3 text-accent hover:bg-accent/15"
          >
            <span
              className="text-xl"
              aria-hidden="true"
            >
              ▤
            </span>
            {!collapsed && (
              <span className="hidden text-sm font-medium md:inline">
                测试用例
              </span>
            )}
          </Link>
        </nav>
        <div className="mt-auto hidden md:block">
          {!collapsed && (
            <p className="px-3 py-4 text-[10px] text-muted">
              让每一次测试，都更简单。
            </p>
          )}
          <Button
            variant="ghost"
            fullWidth
            isIconOnly={collapsed}
            className="justify-start"
            onPress={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            aria-controls="workspace-navigation"
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
          >
            <span
              className="text-xl"
              aria-hidden="true"
            >
              {collapsed ? '»' : '«'}
            </span>
            {!collapsed && <span className="text-xs">收起侧栏</span>}
          </Button>
        </div>
      </Surface>
      <div className="flex min-w-0 flex-col">
        <Surface
          render={(props) => <header {...props} />}
          className="flex min-h-18 items-center justify-between gap-4 border-b border-border px-4 md:px-10"
        >
          <Breadcrumbs aria-label="当前位置">
            <Breadcrumbs.Item href="/">工作区</Breadcrumbs.Item>
            <Breadcrumbs.Item>测试用例</Breadcrumbs.Item>
          </Breadcrumbs>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-muted sm:inline">
              本地工作区
            </span>
            <Avatar
              size="sm"
              aria-label="默认工作区"
            >
              <Avatar.Fallback>P</Avatar.Fallback>
            </Avatar>
          </div>
        </Surface>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-10 md:py-12"
        >
          {children}
        </main>
        <footer className="flex justify-between gap-3 px-4 py-5 text-[10px] text-muted md:px-10">
          <span>Play · 自动化测试工作台</span>
          <span className="hidden sm:inline">少一些重复，多一些专注。</span>
        </footer>
      </div>
    </div>
  );
}
