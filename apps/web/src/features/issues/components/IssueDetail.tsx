'use client';

import { StatusBadge } from '@/components/shared/StatusBadge';

import { useTranslations, useFormatter } from 'next-intl';
import { useIssueLabels, useIssuePresentation } from '@/features/issues/presentation';

import { LoadingState } from '@/components/shared/LoadingState';

import styles from './IssueDetail.module.css';

import { Textarea } from '@/components/ui/Textarea';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import useSWR from 'swr';
import { useIssueRealtime } from '../useIssueRealtime';
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
  busy,
  onBusyChange,
  onStarted,
}: {
  id: string;
  occurrence: IssueOccurrence;
  active: boolean;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onStarted: () => Promise<unknown>;
}) {
  const t = useTranslations('issues');
  const format = useFormatter();
  const submit = useRunSubmission();
  const [version, setVersion] = useState(occurrence.snapshot.testId ? 'current' : '');
  const [startError, setStartError] = useState('');
  const [loadVersions, setLoadVersions] = useState(!occurrence.snapshot.testId);
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
    onBusyChange(true);
    setStartError('');
    try {
      await submit(`/api/issues/${id}/verifications`, {
        occurrenceId: occurrence.id,
        ...(version !== 'current' ? { recordingVersionId: version } : {}),
      });
      await onStarted();
    } catch (cause) {
      setStartError(cause instanceof Error ? cause.message : t('startFailed'));
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <div className={styles.verificationControls}>
      <Select
        aria-label={t('verificationVersion', { name: occurrence.snapshot.name })}
        value={version}
        disabled={busy || active}
        onValueChange={setVersion}
        className={styles.select}
        items={[
          ...(!occurrence.snapshot.testId
            ? [{ value: '', label: t('chooseRecordingVersion'), disabled: true }]
            : []),
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
        variant="ghost"
        size="sm"
        onClick={() => {
          if (loadVersions) void refreshVersions();
          else setLoadVersions(true);
        }}
        disabled={isLoading || busy || active}
      >
        {isLoading ? t('loadingVersions') : loadVersions ? t('refreshVersions') : t('loadVersions')}
      </Button>
      {versionsError && (
        <p role="alert" className={styles.error}>
          {versionsError.message}
        </p>
      )}
      {loadVersions && data && !data.versions.length && !occurrence.snapshot.testId && (
        <p className={styles.emptyMessage}>{t('noRecordingVersions')}</p>
      )}
      {startError && (
        <p role="alert" className={styles.error}>
          {startError}
        </p>
      )}
      <Button
        variant="primary"
        onClick={() => void start()}
        disabled={
          busy || active || !version || (version === 'current' && !occurrence.snapshot.testId)
        }
      >
        {busy ? t('starting') : active ? t('verificationLabels.pending') : t('startVerification')}
      </Button>
    </div>
  );
}

export function IssueDetail({ id }: { id: string }) {
  const connected = useIssueRealtime();
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
      connected
        ? 0
        : current?.verifications.some((item) => item.outcome === 'pending')
          ? 5000
          : 30000,
  });
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState('');
  const [startingVerification, setStartingVerification] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toastManager = useToastManager();

  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    if (!data || !comment.trim() || commentBusy) return;
    setCommentBusy(true);
    setCommentError('');
    try {
      await api.patch(`/api/issues/${id}`, {
        json: { version: data.issue.version, comment: comment.trim() },
      });
      setComment('');
      await mutate();
    } catch (cause) {
      setCommentError(cause instanceof Error ? cause.message : t('submitFailed'));
    } finally {
      setCommentBusy(false);
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
  const verificationSource = occurrences.find((item) => item.id === selectedOccurrenceId) ?? latest;
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
          <span className={styles.category}>{issueCategories[issue.category]}</span>
          <h1 className={styles.title}>{issue.title}</h1>
        </div>
        <div className={styles.actions}>
          <Button
            variant="primary"
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
          <Button disabled={busy} onClick={() => setEditing(true)}>
            {t('editIssue')}
          </Button>
        </div>
      </div>
      <div className={styles.metadata}>
        <StatusBadge
          tone={
            issue.status === 'closed' ? 'success' : issue.status === 'open' ? 'neutral' : 'warning'
          }
        >
          {issueStatuses[issue.status]}
        </StatusBadge>
        <StatusBadge
          tone={issue.severity === 'critical' || issue.severity === 'high' ? 'danger' : 'neutral'}
        >
          {issueSeverities[issue.severity]}
        </StatusBadge>
        <span className={styles.environment}>{environmentLabel(latest)}</span>
        <span>
          {t('runsCount', {
            count: issue.runCount ?? new Set(occurrences.map((item) => item.runId)).size,
          })}
        </span>
        <span>
          {t('firstSeen', {
            time: relativeTime(issue.firstSeen ?? occurrences.at(-1)?.createdAt ?? issue.createdAt),
          })}
        </span>
        <span>
          {t('lastSeen', {
            time: relativeTime(issue.lastSeen ?? latest?.createdAt ?? issue.createdAt),
          })}
        </span>
        {issue.closeReason && (
          <span>{t('closeReasonText', { reason: closeReasons[issue.closeReason] })}</span>
        )}
      </div>
      {(error || loadError) && (
        <p className={styles.loadError} role="alert">
          {error || loadError?.message}
        </p>
      )}
      <div className={styles.layout}>
        <div className={styles.main}>
          {issue.description && (
            <section className={styles.section} aria-label={t('description')}>
              <h2 className={styles.heading}>{t('description')}</h2>
              <p className={styles.issueDescription}>{issue.description}</p>
            </section>
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
                        <span className={styles.stepNumber}>
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span>{title}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </section>
          )}
          <section className={styles.historySection} aria-label={t('occurrences')}>
            <h2 className={styles.historyTitle}>
              {t('occurrenceCount', { count: occurrences.length })}
            </h2>
            {!occurrences.length && <p className={styles.emptyMessage}>{t('noOccurrences')}</p>}
            <div className={styles.occurrences}>
              {occurrences.map((item, index) => {
                const status =
                  item.snapshot.runStatus === 'passed' || item.snapshot.runStatus === 'cancelled'
                    ? item.snapshot.runStatus
                    : item.snapshot.runStatus === 'failed' ||
                        item.snapshot.step?.status === 'failed'
                      ? 'failed'
                      : 'unknown';
                const startedAt = item.snapshot.startedAt ?? item.createdAt;

                return (
                  <details key={item.id} className={styles.occurrence} open={index === 0}>
                    <summary className={styles.occurrenceSummary}>
                      <span className={styles.occurrenceName}>{item.snapshot.name}</span>
                      <StatusBadge
                        tone={
                          status === 'passed'
                            ? 'success'
                            : status === 'failed'
                              ? 'danger'
                              : 'neutral'
                        }
                      >
                        {t(status)}
                      </StatusBadge>
                      <span className={styles.occurrenceEnvironment}>{environmentLabel(item)}</span>
                      <time
                        className={styles.occurrenceTime}
                        dateTime={startedAt}
                        title={format.dateTime(new Date(startedAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      >
                        {relativeTime(startedAt)}
                      </time>
                    </summary>
                    <div className={styles.occurrenceBody}>
                      <div className={styles.occurrenceHeading}>
                        <strong>{item.snapshot.step?.title ?? item.snapshot.goal}</strong>
                        <Link className={styles.detailsLink} href={`/runs/${item.runId}`}>
                          {t('viewDiscoveryRun')}
                        </Link>
                      </div>
                      {item.snapshot.durationMs != null && (
                        <p className={styles.occurrenceMetadata}>
                          {t('duration')} · {(item.snapshot.durationMs / 1000).toFixed(1)}s
                        </p>
                      )}
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
                      {item.snapshot.error && (
                        <p className={styles.occurrenceError}>{item.snapshot.error}</p>
                      )}
                      {item.snapshot.artifacts.some((frame) => frame.kind === 'screenshot') && (
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
                                <figure>
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
                                  <figcaption className={styles.caption}>
                                    {frame.stage === 'before' ? t('before') : t('after')}
                                  </figcaption>
                                </figure>
                              </a>
                            ))}
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        </div>
        <aside className={styles.sidebar}>
          <section className={styles.historySection} aria-label={t('verification')}>
            <h2 className={styles.verificationHeading}>{t('verification')}</h2>
            {verificationSource && (
              <div className={styles.verificationSetup}>
                {occurrences.length > 1 && (
                  <Select
                    aria-label={t('verificationSource')}
                    className={styles.select}
                    value={verificationSource.id}
                    onValueChange={setSelectedOccurrenceId}
                    disabled={active || startingVerification}
                    items={occurrences.map((item) => ({
                      value: item.id,
                      label: `${item.snapshot.name} · ${format.dateTime(new Date(item.createdAt), { dateStyle: 'short', timeStyle: 'short' })}`,
                    }))}
                  />
                )}
                <VerificationAction
                  key={verificationSource.id}
                  id={id}
                  occurrence={verificationSource}
                  active={active}
                  busy={startingVerification}
                  onBusyChange={setStartingVerification}
                  onStarted={() => mutate()}
                />
              </div>
            )}
            {!verifications.length && (
              <p className={styles.emptyMessage}>
                {t(verificationSource ? 'verificationGuidance' : 'noOccurrences')}
              </p>
            )}
            {verifications.map((item) => (
              <div key={item.id} className={styles.verification}>
                <div className={styles.verificationSummary}>
                  <StatusBadge
                    tone={
                      item.outcome === 'passed'
                        ? 'success'
                        : item.outcome === 'failed'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {verificationLabels[item.outcome]}
                  </StatusBadge>
                  <Link className={styles.detailsLink} href={`/runs/${item.runId}`}>
                    {t('viewVerificationRun')}
                  </Link>
                </div>
                {item.explanation && (
                  <p className={styles.verificationExplanation}>{item.explanation}</p>
                )}
                <time className={styles.eventTime} dateTime={item.createdAt}>
                  {format.dateTime(new Date(item.createdAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>
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
                  disabled={commentBusy}
                  required
                  maxLength={10000}
                />
              </label>
              {commentError && (
                <p role="alert" className={styles.error}>
                  {commentError}
                </p>
              )}
              <Button
                className={styles.commentSubmit}
                type="submit"
                disabled={commentBusy || !comment.trim()}
              >
                {commentBusy ? t('saving') : t('addComment')}
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
        </aside>
      </div>
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
