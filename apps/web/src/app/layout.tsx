import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import clsx from 'clsx';
import styles from './layout.module.css';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '@/app/globals.css';
import { ToastProvider } from '@/components/ui/Toast';
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing');

  return { title: 'Testdog', description: t('metaDescription') };
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const locale = await getLocale();
  const requestCookies = await cookies();
  const theme = requestCookies.get('theme')?.value === 'dark' ? 'dark' : 'light';
  const workspace = requestCookies.get('testdog_team')?.value || 'personal';

  return (
    <html
      lang={locale === 'zh' ? 'zh-CN' : 'en'}
      data-theme={theme}
      data-workspace={workspace}
      className={clsx(geistSans.variable, geistMono.variable)}
    >
      <body>
        <div className={styles.container}>
          <NextIntlClientProvider>
            <ToastProvider>
              <AuthCacheBoundary>
                <NuqsAdapter>
                  <AppShell>{children}</AppShell>
                </NuqsAdapter>
              </AuthCacheBoundary>
            </ToastProvider>
          </NextIntlClientProvider>
        </div>
      </body>
    </html>
  );
}
