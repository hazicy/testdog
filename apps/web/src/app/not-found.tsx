import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/shared/ErrorState';

export default function NotFound() {
  const t = useTranslations('shared');

  return <ErrorState illustration="not-found" message={t('notFound')} />;
}
