'use client';

import { useFormatter, useNow, useTranslations } from 'next-intl';
import type { IssueOccurrence } from '@testdog/contracts/issues/types';

export function useIssueLabels() {
  const t = useTranslations('issues');

  return {
    issueStatuses: {
      open: t('issueStatuses.open'),
      in_progress: t('issueStatuses.in_progress'),
      pending_verification: t('issueStatuses.pending_verification'),
      closed: t('issueStatuses.closed'),
    },
    issueSeverities: {
      critical: t('issueSeverities.critical'),
      high: t('issueSeverities.high'),
      medium: t('issueSeverities.medium'),
      low: t('issueSeverities.low'),
    },
    closeReasons: {
      fixed: t('closeReasons.fixed'),
      dismissed: t('closeReasons.dismissed'),
      duplicate: t('closeReasons.duplicate'),
      unreproducible: t('closeReasons.unreproducible'),
    },
    verificationLabels: {
      pending: t('verificationLabels.pending'),
      passed: t('verificationLabels.passed'),
      failed: t('verificationLabels.failed'),
      inconclusive: t('verificationLabels.inconclusive'),
    },
  };
}

export function useIssuePresentation() {
  const t = useTranslations('issues');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60000 });

  return {
    relativeTime: (value: string) => format.relativeTime(new Date(value), now),
    environmentLabel: (occurrence?: IssueOccurrence | null) => {
      if (!occurrence) return t('noEnvironment');
      const environment = occurrence.snapshot.environment;
      const name = environment?.name ?? environment?.environment;

      return typeof name === 'string' ? name : (occurrence.snapshot.target?.platform ?? 'web');
    },
  };
}
