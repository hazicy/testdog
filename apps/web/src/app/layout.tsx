import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import clsx from 'clsx';
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('marketing');

  return { title: 'Testdog', description: t('metaDescription') };
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const locale = await getLocale();
  const theme = (await cookies()).get('theme')?.value === 'dark' ? 'dark' : 'light';

  return (
    <html
      lang={locale === 'zh' ? 'zh-CN' : 'en'}
      data-theme={theme}
      className={clsx(geistSans.variable, geistMono.variable)}
    >
      <body>
        <div className={styles.container}>
          <NextIntlClientProvider>
            <AuthCacheBoundary>
              <AppShell>{children}</AppShell>
            </AuthCacheBoundary>
          </NextIntlClientProvider>
        </div>
      </body>
    </html>
  );
}
