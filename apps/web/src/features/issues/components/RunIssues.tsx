'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useIssueLabels } from '@/features/issues/presentation';
import { time } from '@/features/runs/presentation';
import type { TestRun } from '@testdog/contracts/runs/types';
import type { Issue, IssueOccurrence } from '@testdog/contracts/issues/types';
import styles from './RunIssues.module.css';

export type RunIssueEntry = { issue: Issue; occurrence: IssueOccurrence };

export function issuePosition(run: TestRun, occurrence: IssueOccurrence) {
  const step = occurrence.snapshot.step;

  if (step?.finishedAt) return Math.max(0, Date.parse(step.finishedAt) - Date.parse(run.startedAt));
  const screenshots = occurrence.snapshot.artifacts.filter((item) => item.kind === 'screenshot');

  if (screenshots.length) return Math.max(...screenshots.map((frame) => frame.elapsedMs));

  return Math.max(0, Date.parse(step?.startedAt ?? run.startedAt) - Date.parse(run.startedAt));
}

export function RunIssues({
  entries,
  run,
  selectedId,
  onLocate,
  onRetry,
  error,
  loading,
  hasMore,
  onLoadMore,
}: {
  entries: RunIssueEntry[];
  run: TestRun;
  selectedId?: string;
  onLocate: (entry: RunIssueEntry) => void;
  onRetry: () => Promise<unknown>;
  error?: string;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const t = useTranslations('issues');
  const { issueStatuses, issueSeverities } = useIssueLabels();

  return (
    <section aria-label={t('linkedIssues')} className={styles.panel}>
      {loading && !entries.length && (
        <p role="status" className={styles.message}>
          {t('loadingLinked')}
        </p>
      )}
      {error && (
        <div role="alert" className={styles.error}>
          {t('linkedLoadError', { error })}
          <Button variant="ghost" size="sm" onClick={() => void onRetry()}>
            {t('retry')}
          </Button>
        </div>
      )}
      {!loading && !error && !entries.length && (
        <p className={styles.empty}>{t('noLinkedIssues')}</p>
      )}
      {entries.length > 0 && (
        <ul className={styles.list}>
          {entries.map((entry) => {
            const { issue, occurrence } = entry;
            const hasStep = run.steps.some((step) => step.id === occurrence.stepId);

            return (
              <li
                key={occurrence.id}
                className={styles.item}
                data-selected={selectedId === occurrence.id || undefined}
              >
                <Link href={`/issues/${issue.id}`} className={styles.title}>
                  {issue.title}
                </Link>
                <div className={styles.metadata}>
                  <span>{issueStatuses[issue.status]}</span>
                  <span>{issueSeverities[issue.severity]}</span>
                </div>
                <div className={styles.actions}>
                  <Button variant="ghost" size="sm" onClick={() => onLocate(entry)}>
                    {hasStep
                      ? t('locateStep')
                      : t('replayIssue', { time: time(issuePosition(run, occurrence)) })}
                  </Button>
                  <Link href={`/issues/${issue.id}`} className={styles.detailsLink}>
                    {t('viewDetails')}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {hasMore && (
        <div className={styles.loadMore}>
          <Button disabled={loading} onClick={onLoadMore}>
            {t('loadMore')}
          </Button>
        </div>
      )}
    </section>
  );
}
