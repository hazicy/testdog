'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Select } from '@/components/ui/Select';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import styles from './landing.module.css';

export function LandingLanguageSelect() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('preferences');
  const [pending, startTransition] = useTransition();

  function switchLanguage(nextLocale: string) {
    if (nextLocale === locale) return;

    document.cookie = `locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    startTransition(() => router.refresh());
  }

  return (
    <Select
      className={styles.languageSelect}
      value={locale}
      disabled={pending}
      aria-label={t('language')}
      items={[
        { value: 'zh', label: <span lang="zh">中文</span> },
        { value: 'en', label: <span lang="en">English</span> },
      ]}
      onValueChange={switchLanguage}
    />
  );
}
