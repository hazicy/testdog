'use client';

import { useTranslations } from 'next-intl';
import type { OccurrenceSnapshot } from '@testdog/contracts/issues/types';
import { actualResult } from '../lib/actualResult';
import styles from './ActualResult.module.css';

export function ActualResult({
  snapshot,
  className,
}: {
  snapshot: OccurrenceSnapshot;
  className?: string;
}) {
  const t = useTranslations('issues');
  const result = actualResult(snapshot);

  return (
    <div className={className}>
      <p>
        {result?.receivedValue
          ? t('observedValue', { value: result.receivedValue })
          : result?.summary || t('noActual')}
      </p>
      {result?.details && (
        <details className={styles.details}>
          <summary>{t('actualDetails')}</summary>
          <pre className={styles.diagnostics}>{result.details}</pre>
        </details>
      )}
    </div>
  );
}
