import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import clsx from 'clsx';
import styles from './layout.module.css';
import type { Metadata } from 'next';
import { Geist_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import '@/app/globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { AppShell } from '@/components/shell/AppShell';
import { AuthCacheBoundary } from '@/features/auth/components/AuthCacheBoundary';

const miSans = localFont({
  src: './fonts/misans-ui.woff2',
  variable: '--font-misans',
  weight: '400 600',
  style: 'normal',
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing');

  return { title: 'TestDog', description: t('metaDescription') };
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
      className={clsx(miSans.variable, geistMono.variable)}
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
