import { classNames } from '@/components/ui/classNames';
import styles from './layout.module.css';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '@/app/globals.css';
import { AppShell } from '@/components/shell/AppShell';
import { AuthCacheBoundary } from '@/features/auth/components/AuthCacheBoundary';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Testdog',
  description:
    '用自然语言编写测试用例，让 AI 规划操作、Playwright 执行浏览器任务，以页面证据验证结果。testdog，让每一次测试更简单。',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="zh-CN" className={classNames(geistSans.variable, geistMono.variable)}>
      <body>
        <div className={styles.container}>
          <AuthCacheBoundary>
            <AppShell>{children}</AppShell>
          </AuthCacheBoundary>
        </div>
      </body>
    </html>
  );
}
