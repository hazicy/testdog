'use client';

import { useTranslations } from 'next-intl';
import { useIssueLabels } from '@/features/issues/presentation';

import clsx from 'clsx';

import studioStyles from '@/features/runs/components/run-studio.module.css';
import styles from './RunIssues.module.css';
import { ActualResult } from './ActualResult';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { asset, time } from '@/features/runs/presentation';
import type { RunArtifact, TestRun } from '@testdog/contracts/runs/types';
import {
  type Issue,
  type IssueOccurrence,
  type IssueStatus,
} from '@testdog/contracts/issues/types';

export type RunIssueEntry = { issue: Issue; occurrence: IssueOccurrence };

export function issuePosition(run: TestRun, occurrence: IssueOccurrence) {
  const step = occurrence.snapshot.step;

  if (step?.finishedAt) return Math.max(0, Date.parse(step.finishedAt) - Date.parse(run.startedAt));
  const screenshots = occurrence.snapshot.artifacts.filter((item) => item.kind === 'screenshot');

  if (screenshots.length) return Math.max(...screenshots.map((frame) => frame.elapsedMs));

  return Math.max(0, Date.parse(step?.startedAt ?? run.startedAt) - Date.parse(run.startedAt));
}

function RunIssueCard({
  entry,
  run,
  index,
  onSelect,
  onFrame,
  onUpdated,
}: {
  entry: RunIssueEntry;
  run: TestRun;
  index: number;
  onSelect: (entry: RunIssueEntry) => void;
  onFrame: (frame: RunArtifact) => void;
  onUpdated: () => Promise<unknown>;
}) {
  const t = useTranslations('issues');
  const { issueStatuses, issueSeverities } = useIssueLabels();
  const { issue, occurrence } = entry;
  const snapshot = occurrence.snapshot;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const expected = snapshot.step?.assertion?.description ?? snapshot.nodeGoal ?? snapshot.goal;
  const reproduction =
    snapshot.reproduction ??
    run.steps
      .filter((step) => !snapshot.step || step.sequence <= snapshot.step.sequence)
      .map((step) => step.title);
  const screenshots = snapshot.artifacts.filter((frame) => frame.kind === 'screenshot');

  async function changeStatus(status: string) {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/api/issues/${issue.id}`, {
        json: {
          version: issue.version,
          status: status as IssueStatus,
          ...(status === 'closed' ? { closeReason: 'fixed' } : {}),
        },
      });
      await onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('updateFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={clsx(studioStyles.runIssueCard, styles.article)}>
      <header className={studioStyles.runIssueHeader}>
        <div className={styles.container}>
          <span className={styles.label}>ISSUE {String(index + 1).padStart(2, '0')}</span>
          <Button onClick={() => onSelect(entry)}>
            {t('replayIssue', { time: time(issuePosition(run, occurrence)) })}
          </Button>
        </div>
        <h2 className={styles.heading}>{issue.title}</h2>
      </header>
      <div data-ui="run-issue-body" className={studioStyles.runIssueBody}>
        <div className={styles.metadata}>
          {/^https?:\/\//.test(snapshot.url) && (
            <a href={snapshot.url} className={styles.link} target="_blank" rel="noreferrer">
              ↗ {snapshot.url}
            </a>
          )}
          <span className={styles.mutedText}>
            {t('severityText', { value: issueSeverities[issue.severity] })}
          </span>
        </div>
        <div className={styles.comparison}>
          <div className={styles.expected}>
            <h3 className={styles.subheading}>{t('expected')}</h3>
            <p className={styles.description}>{expected || t('noExpected')}</p>
          </div>
          <div className={styles.actual}>
            <h3 className={styles.actualHeading}>{t('actual')}</h3>
            <ActualResult snapshot={snapshot} className={styles.description} />
          </div>
        </div>
        <details open className={styles.details}>
          <summary className={styles.summary}>
            {t('reproductionCount', { count: reproduction.length })}
          </summary>
          <ol className={styles.ol}>
            {reproduction.map((title, position) => (
              <li key={position} className={styles.item}>
                <span className={styles.stepNumber}>{String(position + 1).padStart(2, '0')}</span>
                <span>{title}</span>
              </li>
            ))}
          </ol>
        </details>
        <details className={styles.details}>
          <summary className={styles.summary}>
            {t('screenshotCount', { count: screenshots.length })}
          </summary>
          {screenshots.length ? (
            <div className={styles.screenshots}>
              {screenshots.map((frame) => (
                <Button
                  key={frame.id}
                  variant="ghost"
                  className={styles.action}
                  aria-label={t('replayEvidence', { time: time(frame.elapsedMs) })}
                  onClick={() => onFrame(frame)}
                >
                  <Image
                    src={asset(run.id, frame)}
                    alt={t('issueScreenshot', { time: time(frame.elapsedMs) })}
                    width={160}
                    height={100}
                    unoptimized
                    className={styles.image}
                  />
                </Button>
              ))}
            </div>
          ) : (
            <p className={styles.emptyEvidence}>{t('noScreenshots')}</p>
          )}
        </details>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
      <footer className={clsx(studioStyles.runIssueActions, styles.footer)}>
        <Select
          aria-label={t('statusForIssue', { title: issue.title })}
          className={styles.select}
          value={issue.status}
          disabled={busy}
          onValueChange={(status) => void changeStatus(status)}
          items={Object.entries(issueStatuses).map(([value, label]) => ({ value, label }))}
        />
        <Link href={`/issues/${issue.id}`} className={styles.detailsLink}>
          {t('viewDetails')}
        </Link>
      </footer>
    </article>
  );
}

export function RunIssues({
  entries,
  run,
  selectedId,
  onSelect,
  onFrame,
  onUpdated,
  error,
  loading,
  hasMore,
  onLoadMore,
}: {
  entries: RunIssueEntry[];
  run: TestRun;
  selectedId?: string;
  onSelect: (entry: RunIssueEntry) => void;
  onFrame: (frame: RunArtifact) => void;
  onUpdated: () => Promise<unknown>;
  error?: string;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const t = useTranslations('issues');
  const selectedIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.occurrence.id === selectedId),
  );
  const selected = entries[selectedIndex];

  return (
    <section
      aria-label={t('linkedIssues')}
      className={clsx(studioStyles.runIssuesView, styles.article)}
    >
      <div className={styles.toolbar}>
        <p className={styles.issueCount}>{t('linkedCount', { count: entries.length })}</p>
        {entries.length > 1 && (
          <Select
            aria-label={t('chooseRunIssue')}
            className={styles.issueSelector}
            value={selected.occurrence.id}
            onValueChange={(id) => {
              const entry = entries.find((item) => item.occurrence.id === id);

              if (entry) onSelect(entry);
            }}
            items={entries.map((entry, index) => ({
              value: entry.occurrence.id,
              label: `${String(index + 1).padStart(2, '0')} · ${entry.issue.title}`,
            }))}
          />
        )}
        {hasMore && (
          <Button className={styles.issueSelector} disabled={loading} onClick={onLoadMore}>
            {t('loadMore')}
          </Button>
        )}
      </div>
      {loading && !entries.length && (
        <p role="status" className={styles.loading}>
          {t('loadingLinked')}
        </p>
      )}
      {error && (
        <p role="alert" className={styles.loadError}>
          {t('linkedLoadError', { error })}
          <Button
            variant="ghost"
            size="sm"
            className={styles.retry}
            onClick={() => void onUpdated()}
          >
            {t('retry')}
          </Button>
        </p>
      )}
      {!loading && !error && !selected && (
        <div className={styles.emptyState}>
          <h2 className={styles.emptyTitle}>{t('noLinkedIssues')}</h2>
          <p className={styles.emptyHint}>{t('linkedHint')}</p>
        </div>
      )}
      {selected && (
        <RunIssueCard
          key={selected.occurrence.id}
          entry={selected}
          run={run}
          index={selectedIndex}
          onSelect={onSelect}
          onFrame={onFrame}
          onUpdated={onUpdated}
        />
      )}
    </section>
  );
}
