'use client';

import { useTranslations, useFormatter } from 'next-intl';
import { useIssueLabels, useIssuePresentation } from '@/features/issues/presentation';

import { LoadingState } from '@/components/shared/LoadingState';

import styles from './IssueDetail.module.css';

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';

import { Textarea } from '@/components/ui/Textarea';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import useSWR from 'swr';
import { api, fetchJson } from '@/client/api';
import { useRunSubmission } from '@/client/useRunSubmission';
import { useToastManager } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ErrorState } from '@/components/shared/ErrorState';
import { asset } from '@/features/runs/presentation';
import { type IssueDetail as Detail, type IssueOccurrence } from '@testdog/contracts/issues/types';
import { IssueEditor } from '@/features/issues/components/IssueEditor';

function VerificationAction({
  id,
  occurrence,
  active,
  onStarted,
  onError,
}: {
  id: string;
  occurrence: IssueOccurrence;
  active: boolean;
  onStarted: () => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations('issues');
  const format = useFormatter();
  const submit = useRunSubmission();
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState('current');
  const [loadVersions, setLoadVersions] = useState(false);
  const {
    data,
    error: versionsError,
    isLoading,
    mutate: refreshVersions,
  } = useSWR<{ versions: { id: string; createdAt: string }[] }>(
    loadVersions ? `/api/runs/${occurrence.runId}/recording` : null,
    fetchJson,
  );

  async function start() {
    setBusy(true);
    try {
      await submit(`/api/issues/${id}/verifications`, {
        occurrenceId: occurrence.id,
        ...(version !== 'current' ? { recordingVersionId: version } : {}),
      });
      onStarted();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : t('startFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <Select
        aria-label={t('verificationVersion', { name: occurrence.snapshot.name })}
        value={version}
        onValueChange={setVersion}
        className={styles.select}
        items={[
          {
            value: 'current',
            label: t('currentTarget'),
            disabled: !occurrence.snapshot.testId,
          },
          ...(data?.versions.map((item) => ({
            value: item.id,
            label: t('recordingVersion', {
              date: format.dateTime(new Date(item.createdAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            }),
          })) ?? []),
        ]}
      />
      <Button
        onClick={() => {
          if (loadVersions) void refreshVersions();
          else setLoadVersions(true);
        }}
        disabled={isLoading}
      >
        {loadVersions ? t('refreshVersions') : t('loadVersions')}
      </Button>
      {versionsError && (
        <p role="alert" className={styles.error}>
          {versionsError.message}
        </p>
      )}
      <Button
        variant="primary"
        onClick={() => void start()}
        disabled={busy || active || (version === 'current' && !occurrence.snapshot.testId)}
      >
        {busy ? t('starting') : t('startVerification')}
      </Button>
    </div>
  );
}

export function IssueDetail({ id }: { id: string }) {
  const t = useTranslations('issues');
  const format = useFormatter();
  const { issueStatuses, issueCategories, issueSeverities, closeReasons, verificationLabels } =
    useIssueLabels();
  const { relativeTime, environmentLabel } = useIssuePresentation();
  const {
    data,
    error: loadError,
    mutate,
  } = useSWR<Detail>(`/api/issues/${id}`, fetchJson, {
    refreshInterval: (current) =>
      current?.verifications.some((item) => item.outcome === 'pending') ? 5000 : 30000,
  });
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toastManager = useToastManager();

  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    if (!data) return;
    setBusy(true);
    setError('');
    try {
      await api.patch(`/api/issues/${id}`, { json: { version: data.issue.version, comment } });
      setComment('');
      await mutate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('submitFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (loadError && !data)
    return (
      <ErrorState
        message={loadError.message || t('loadFailed')}
        retry={() => void mutate()}
        href="/issues"
        linkLabel={t('backToIssues')}
      />
    );
  if (!data) return <LoadingState message={t('loading')} />;
  const { issue, occurrences, events, verifications } = data;
  const latest = occurrences[0];
  const expected =
    latest?.snapshot.step?.assertion?.description ??
    latest?.snapshot.nodeGoal ??
    latest?.snapshot.goal;
  const actual = latest?.snapshot.step?.evidence ?? latest?.snapshot.error;
  const active = verifications.some((item) => item.outcome === 'pending');

  return (
    <article className={styles.article}>
      <Link href="/issues" className={styles.link}>
        {t('backLink')}
      </Link>
      <div className={styles.header}>
        <div className={styles.headingGroup}>
          <span className={styles.category}>
            {issue.category === 'product' ? 'BUG' : issueCategories[issue.category]}
          </span>
          <h1 className={styles.title}>{issue.title}</h1>
        </div>
        <div className={styles.actions}>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await api.patch(`/api/issues/${id}`, {
                  json: {
                    version: issue.version,
                    status: issue.status === 'closed' ? 'open' : 'closed',
                    ...(issue.status === 'closed' ? {} : { closeReason: 'fixed' }),
                  },
                });
                await mutate();
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : t('updateFailed'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {issue.status === 'closed' ? t('reopen') : t('resolve')}
          </Button>
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  [
                    t('fixIssue', { title: issue.title }),
                    issue.description,
                    t('address', { value: latest?.snapshot.url ?? t('notProvided') }),
                    t('expectedText', { value: expected ?? t('notProvided') }),
                    t('actualText', { value: actual ?? t('notProvided') }),
                    t('reproductionPrompt'),
                    ...(latest?.snapshot.reproduction ?? []).map(
                      (title, index) => `${index + 1}. ${title}`,
                    ),
                  ].join('\n'),
                );
                toastManager.add({ title: t('copiedPrompt'), type: 'success' });
              } catch {
                toastManager.add({ title: t('clipboardFailed'), type: 'error' });
              }
            }}
          >
            {t('copyPrompt')}
          </Button>
          <Button className={styles.action} onClick={() => setEditing(true)}>
            {t('editIssue')}
          </Button>
        </div>
      </div>
      <div className={styles.metadata}>
        <span className={styles.environment}>{environmentLabel(latest)}</span>
        <span>
          {t('runsCount', { count: new Set(occurrences.map((item) => item.runId)).size })}
        </span>
        <span>
          {t('firstSeen', { time: relativeTime(occurrences.at(-1)?.createdAt ?? issue.createdAt) })}
        </span>
        <span>{t('lastSeen', { time: relativeTime(latest?.createdAt ?? issue.createdAt) })}</span>
        <span>{issueStatuses[issue.status]}</span>
        <span>{issueCategories[issue.category]}</span>
        <span>{issueSeverities[issue.severity]}</span>
        {issue.closeReason && (
          <span>{t('closeReasonText', { reason: closeReasons[issue.closeReason] })}</span>
        )}
      </div>
      {(error || loadError) && (
        <p className={styles.loadError} role="alert">
          {error || loadError?.message}
        </p>
      )}
      {latest && (
        <section className={styles.section} aria-label={t('latestOccurrence')}>
          <h2 className={styles.heading}>{t('latestOccurrence')}</h2>
          <div className={styles.latestOccurrence}>
            <div className={styles.comparison}>
              <div>
                <h3 className={styles.expectedHeading}>{t('expected')}</h3>
                <p className={styles.description}>{expected || t('noExpected')}</p>
              </div>
              <div>
                <h3 className={styles.actualHeading}>{t('actual')}</h3>
                <p className={styles.description}>{actual || t('noActual')}</p>
              </div>
            </div>
            <div className={styles.reproduction}>
              {/^https?:\/\//.test(latest.snapshot.url) && (
                <a
                  className={styles.targetLink}
                  href={latest.snapshot.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  ↗ {latest.snapshot.url}
                </a>
              )}
              <h3 className={styles.reproductionHeading}>{t('reproduction')}</h3>
              <ol className={styles.ol}>
                {(
                  latest.snapshot.reproduction ??
                  [latest.snapshot.goal, latest.snapshot.step?.title].filter(
                    (title): title is string => !!title,
                  )
                ).map((title, index) => (
                  <li key={index} className={styles.item}>
                    <span className={styles.stepNumber}>{String(index + 1).padStart(2, '0')}</span>
                    <span>{title}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      )}
      <p className={styles.issueDescription}>{issue.description || t('noDescription')}</p>
      <section className={styles.historySection} aria-label={t('occurrences')}>
        <div className={styles.historyHeading}>
          <h2 className={styles.historyTitle}>
            {t('occurrenceCount', { count: occurrences.length })}
          </h2>
          <span className={styles.historySummary}>
            {t('runsCount', { count: new Set(occurrences.map((item) => item.runId)).size })} ·{' '}
            {t('environmentCount', { count: new Set(occurrences.map(environmentLabel)).size })}
          </span>
        </div>
        {occurrences.length > 0 && (
          <div className={styles.occurrenceTable}>
            <Table>
              <TableHeader className={styles.tableHeader}>
                <TableRow>
                  {[t('status'), t('run'), t('environment'), t('duration'), t('startedAt')].map(
                    (title) => (
                      <TableHead className={styles.tableHead} key={title}>
                        {title}
                      </TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {occurrences.map((item) => (
                  <TableRow key={item.id} className={styles.tableRow}>
                    <TableCell className={styles.tableCell}>
                      <span className={styles.runStatus}>
                        {item.snapshot.runStatus === 'passed'
                          ? t('passed')
                          : item.snapshot.runStatus === 'cancelled'
                            ? t('cancelled')
                            : item.snapshot.runStatus === 'failed' ||
                                item.snapshot.step?.status === 'failed'
                              ? t('failed')
                              : t('unknown')}
                      </span>
                    </TableCell>
                    <TableCell className={styles.tableCell}>
                      <Link className={styles.runLink} href={`/runs/${item.runId}`}>
                        {item.snapshot.name}
                      </Link>
                    </TableCell>
                    <TableCell className={styles.tableCell}>{environmentLabel(item)}</TableCell>
                    <TableCell className={styles.tableCell}>
                      {item.snapshot.durationMs == null
                        ? '—'
                        : `${(item.snapshot.durationMs / 1000).toFixed(1)}s`}
                    </TableCell>
                    <TableCell className={styles.timestampCell}>
                      {relativeTime(item.snapshot.startedAt ?? item.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {!occurrences.length && <p className={styles.emptyMessage}>{t('noRuns')}</p>}
        {occurrences.map((item) => (
          <div key={item.id} className={styles.occurrence}>
            <div className={styles.occurrenceHeading}>
              <strong>
                {item.snapshot.name} {item.snapshot.step && ` / ${item.snapshot.step.title}`}
              </strong>
              <Link className={styles.detailsLink} href={`/runs/${item.runId}`}>
                {t('viewDiscoveryRun')}
              </Link>
            </div>
            <p className={styles.occurrenceMetadata}>
              {item.snapshot.target?.platform ?? 'web'} ·{' '}
              {format.dateTime(new Date(item.createdAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
            {item.snapshot.step?.assertion && (
              <p className={styles.assertion}>
                {t('expectedText', { value: item.snapshot.step.assertion.description })}
              </p>
            )}
            {item.snapshot.step?.evidence && (
              <p className={styles.evidence}>
                {t('evidenceText', { value: item.snapshot.step.evidence })}
              </p>
            )}
            {item.snapshot.error && <p className={styles.occurrenceError}>{item.snapshot.error}</p>}
            <div className={styles.screenshots}>
              {item.snapshot.artifacts
                .filter((frame) => frame.kind === 'screenshot')
                .slice(-4)
                .map((frame) => (
                  <a
                    key={frame.id}
                    href={asset(item.runId, frame)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Image
                      width={200}
                      height={120}
                      unoptimized
                      className={styles.image}
                      src={asset(item.runId, frame)}
                      alt={t('issueEvidence', {
                        stage: frame.stage === 'before' ? t('before') : t('after'),
                      })}
                    />
                  </a>
                ))}
            </div>
            <VerificationAction
              id={id}
              occurrence={item}
              active={active}
              onStarted={() => {
                setError('');
                void mutate();
              }}
              onError={setError}
            />
          </div>
        ))}
      </section>
      <section className={styles.historySection} aria-label={t('verification')}>
        <h2 className={styles.verificationHeading}>{t('verification')}</h2>
        {!verifications.length && <p className={styles.emptyMessage}>{t('verificationHint')}</p>}
        {verifications.map((item) => (
          <div key={item.id} className={styles.verification}>
            <div className={styles.verificationSummary}>
              <strong>{verificationLabels[item.outcome]}</strong>
              <Link className={styles.detailsLink} href={`/runs/${item.runId}`}>
                {t('viewVerificationRun')}
              </Link>
            </div>
            <p className={styles.verificationExplanation}>{item.explanation}</p>
          </div>
        ))}
      </section>
      <section className={styles.historySection} aria-label={t('activity')}>
        <h2 className={styles.verificationHeading}>{t('activity')}</h2>
        <form onSubmit={addComment} className={styles.form}>
          <label className={styles.field}>
            {t('comment')}
            <Textarea
              className={styles.input}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              required
              maxLength={10000}
            />
          </label>
          <Button className={styles.commentSubmit} type="submit" disabled={busy || !comment.trim()}>
            {t('addComment')}
          </Button>
        </form>
        <ol className={styles.events}>
          {events.map((event) => (
            <li key={event.id} className={styles.event}>
              <p className={styles.eventMessage}>{event.message}</p>
              <p className={styles.eventTime}>
                {format.dateTime(new Date(event.createdAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            </li>
          ))}
        </ol>
      </section>
      {editing && (
        <IssueEditor
          issue={issue}
          onDismiss={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void mutate();
          }}
        />
      )}
    </article>
  );
}
