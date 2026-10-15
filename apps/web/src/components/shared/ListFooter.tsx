'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/Button';
import styles from './ListFooter.module.css';

type Props = {
  loading: boolean;
  count: number;
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  previousPage: () => void;
  nextPage: () => void;
};

export function ListFooter({
  loading,
  count,
  page,
  hasPrevious,
  hasNext,
  previousPage,
  nextPage,
}: Props) {
  const t = useTranslations('shared');

  if (page === 1 && (loading || count === 0)) return null;

  return (
    <div data-ui="workspace-index-footer" className={styles.footer}>
      <nav className={styles.pagination} aria-label={t('pagination')}>
        <Button variant="ghost" size="sm" disabled={!hasPrevious || loading} onClick={previousPage}>
          {t('previousPage')}
        </Button>
        <span aria-current="page">{t('page', { page })}</span>
        <Button variant="ghost" size="sm" disabled={!hasNext || loading} onClick={nextPage}>
          {t('nextPage')}
        </Button>
      </nav>
    </div>
  );
}
