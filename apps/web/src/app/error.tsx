'use client';

import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/shared/ErrorState';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('shared');

  return <ErrorState message={t('pageError')} retry={reset} />;
}
