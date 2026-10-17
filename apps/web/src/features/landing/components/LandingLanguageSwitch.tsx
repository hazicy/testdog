'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import styles from './landing.module.css';

export function LandingLanguageSwitch() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const nextLocale = locale === 'zh' ? 'en' : 'zh';

  function switchLanguage() {
    document.cookie = `locale=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      className={styles.languageSwitch}
      disabled={pending}
      aria-label={locale === 'zh' ? '切换为英文' : 'Switch to Chinese'}
      onClick={switchLanguage}
    >
      <span lang={nextLocale}>{nextLocale === 'en' ? 'EN' : '中文'}</span>
    </button>
  );
}
