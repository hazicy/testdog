'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Select } from '@/components/ui/Select';
import styles from './Settings.module.css';

export function GeneralSettings({ initialTheme }: { initialTheme: string }) {
  const locale = useLocale();
  const t = useTranslations('preferences');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [theme, setTheme] = useState(initialTheme);

  function saveCookie(name: string, value: string) {
    document.cookie = `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  return (
    <section className={styles.settingsSection} aria-labelledby="general-title">
      <h2 id="general-title" className={styles.heading}>
        {t('title')}
      </h2>
      <label className={styles.field}>
        <span>{t('language')}</span>
        <Select
          aria-label={t('language')}
          value={locale}
          disabled={pending}
          items={[
            { value: 'zh', label: '中文' },
            { value: 'en', label: 'English' },
          ]}
          onValueChange={(value) => {
            saveCookie('locale', value);
            startTransition(() => router.refresh());
          }}
        />
      </label>
      <label className={styles.field}>
        <span>{t('theme')}</span>
        <Select
          aria-label={t('theme')}
          value={theme}
          items={(['light', 'dark'] as const).map((value) => ({ value, label: t(value) }))}
          onValueChange={(value) => {
            saveCookie('theme', value);
            document.documentElement.dataset.theme = value;
            setTheme(value);
          }}
        />
      </label>
    </section>
  );
}
