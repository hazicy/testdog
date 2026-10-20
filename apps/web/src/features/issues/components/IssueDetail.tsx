'use client';

import { StatusBadge } from '@/components/shared/StatusBadge';

import { useTranslations, useFormatter } from 'next-intl';
import { useIssueLabels, useIssuePresentation } from '@/features/issues/presentation';

import { LoadingState } from '@/components/shared/LoadingState';

import styles from './IssueDetail.module.css';

import { useId, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useIssueRealtime } from '../useIssueRealtime';
import { api, fetchJson } from '@/client/api';
import { useRunSubmission } from '@/client/useRunSubmission';
import { useToastManager } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ErrorState } from '@/components/shared/ErrorState';
import { type IssueDetail as Detail, type IssueOccurrence } from '@testdog/contracts/issues/types';
import { ActualResult } from './ActualResult';
import { IssueEditor } from '@/features/issues/components/IssueEditor';
import { Dialog, DialogHeader } from '@/components/ui/Dialog';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';
import { Icon } from '@iconify/react/offline';
import checkIcon from '@iconify-icons/lucide/circle-check';
import copyIcon from '@iconify-icons/lucide/copy';
import editIcon from '@iconify-icons/lucide/pencil';
import replayIcon from '@iconify-icons/lucide/rotate-ccw';
import closeIcon from '@iconify-icons/lucide/x';
import externalIcon from '@iconify-icons/lucide/external-link';

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
  const { issueStatuses, issueCategories, closeReasons, verificationLabels } = useIssueLabels();
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
  const [verificationOpen, setVerificationOpen] = useState(false);
  const verificationTitleId = useId();
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState('');
  const [startingVerification, setStartingVerification] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toastManager = useToastManager();

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
  const { issue, occurrences, verifications } = data;
  const latest = occurrences[0];
  const verificationSource = occurrences.find((item) => item.id === selectedOccurrenceId) ?? latest;
  const expected =
    latest?.snapshot.step?.assertion?.description ??
    latest?.snapshot.nodeGoal ??
    latest?.snapshot.goal;
  const active = verifications.some((item) => item.outcome === 'pending');
  const runCount = issue.runCount ?? new Set(occurrences.map((item) => item.runId)).size;
  const reproduction =
    latest?.snapshot.reproduction ??
    [latest?.snapshot.goal, latest?.snapshot.step?.title].filter(
      (title): title is string => !!title,
    );

  async function copyAddress(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toastManager.add({ title: t('copiedAddress'), type: 'success' });
    } catch {
      toastManager.add({ title: t('clipboardFailed'), type: 'error' });
    }
  }

  return (
    <article className={styles.article}>
      <Link href="/issues" className={styles.link}>
        {t('backLink')}
      </Link>
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          <div className={styles.titleRow}>
            <span className={styles.category} data-category={issue.category}>
              {issue.category === 'product' ? 'BUG' : issueCategories[issue.category]}
            </span>
            <h1 className={styles.title}>{issue.title}</h1>
          </div>
          <div className={styles.metadata}>
            {latest && <span className={styles.environment}>{environmentLabel(latest)}</span>}
            <span>{t('runsCount', { count: runCount })}</span>
            <span>
              {t('firstSeen', {
                time: relativeTime(
                  issue.firstSeen ?? occurrences.at(-1)?.createdAt ?? issue.createdAt,
                ),
              })}
            </span>
            <span>
              {t('lastSeen', {
                time: relativeTime(issue.lastSeen ?? latest?.createdAt ?? issue.createdAt),
              })}
            </span>
            <StatusBadge
              tone={
                issue.status === 'closed'
                  ? 'success'
                  : issue.status === 'open'
                    ? 'neutral'
                    : 'warning'
              }
            >
              {issueStatuses[issue.status]}
            </StatusBadge>
            {issue.closeReason && (
              <span>{t('closeReasonText', { reason: closeReasons[issue.closeReason] })}</span>
            )}
          </div>
        </div>
        <div className={styles.actions}>
          {latest && (
            <Button onClick={() => setVerificationOpen(true)}>
              <Icon icon={replayIcon} className={styles.icon} aria-hidden="true" />
              {t('verification')}
            </Button>
          )}
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
            <Icon icon={checkIcon} className={styles.icon} aria-hidden="true" />
            {issue.status === 'closed' ? t('reopen') : t('resolve')}
          </Button>
          <Tooltip content={t('editIssue')}>
            <Button
              size="icon"
              disabled={busy}
              aria-label={t('editIssue')}
              onClick={() => setEditing(true)}
            >
              <Icon icon={editIcon} className={styles.icon} aria-hidden="true" />
            </Button>
          </Tooltip>
        </div>
      </header>
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
                <ActualResult snapshot={latest.snapshot} className={styles.description} />
              </div>
            </div>
            <div className={styles.reproduction}>
              {/^https?:\/\//.test(latest.snapshot.url) && (
                <div className={styles.targetAddress}>
                  <a
                    className={styles.targetLink}
                    href={latest.snapshot.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon icon={externalIcon} className={styles.icon} aria-hidden="true" />
                    <span>{latest.snapshot.url}</span>
                  </a>
                  <Tooltip content={t('copyAddress')}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('copyAddress')}
                      onClick={() => void copyAddress(latest.snapshot.url)}
                    >
                      <Icon icon={copyIcon} className={styles.icon} aria-hidden="true" />
                    </Button>
                  </Tooltip>
                </div>
              )}
              <h3 className={styles.reproductionHeading}>{t('reproduction')}</h3>
              <ol className={styles.ol}>
                {reproduction.map((title, index) => (
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
      <section className={styles.historySection} aria-label={t('occurrences')}>
        <div className={styles.sectionHeading}>
          <h2 className={styles.heading}>{t('occurrences')}</h2>
          {occurrences.length > 0 && (
            <span className={styles.historySummary}>
              {t('runsCount', { count: runCount })} ·{' '}
              {t('environmentCount', { count: new Set(occurrences.map(environmentLabel)).size })}
            </span>
          )}
        </div>
        {!occurrences.length ? (
          <p className={styles.emptyMessage}>{t('noOccurrences')}</p>
        ) : (
          <div
            className={styles.tableScroll}
            role="region"
            aria-label={t('occurrencesTable')}
            tabIndex={0}
          >
            <Table className={styles.table}>
              <TableHeader>
                <TableRow>
                  {[t('status'), t('run'), t('environment'), t('duration'), t('startedAt')].map(
                    (label) => (
                      <TableHead key={label}>{label}</TableHead>
                    ),
                  )}
                  <TableHead aria-label={t('issueActions')} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {occurrences.map((item) => {
                  const status =
                    item.snapshot.runStatus === 'passed' || item.snapshot.runStatus === 'cancelled'
                      ? item.snapshot.runStatus
                      : item.snapshot.runStatus === 'failed' ||
                          item.snapshot.step?.status === 'failed'
                        ? 'failed'
                        : 'unknown';
                  const startedAt = item.snapshot.startedAt ?? item.createdAt;

                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <StatusBadge
                          tone={
                            status === 'failed'
                              ? 'danger'
                              : status === 'passed'
                                ? 'success'
                                : 'neutral'
                          }
                        >
                          {t(status)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className={styles.runCell}>
                        <Link className={styles.runLink} href={`/runs/${item.runId}`}>
                          {item.snapshot.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className={styles.environment}>{environmentLabel(item)}</span>
                      </TableCell>
                      <TableCell>
                        {item.snapshot.durationMs == null
                          ? '—'
                          : `${format.number(item.snapshot.durationMs / 1000, { maximumFractionDigits: 1 })}s`}
                      </TableCell>
                      <TableCell>
                        <time
                          dateTime={startedAt}
                          title={format.dateTime(new Date(startedAt), {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        >
                          {format.dateTime(new Date(startedAt), { month: 'short', day: 'numeric' })}
                        </time>
                      </TableCell>
                      <TableCell className={styles.rowAction}>
                        <Tooltip content={t('verifyOccurrence', { name: item.snapshot.name })}>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('verifyOccurrence', { name: item.snapshot.name })}
                            onClick={() => {
                              setSelectedOccurrenceId(item.id);
                              setVerificationOpen(true);
                            }}
                          >
                            <Icon icon={replayIcon} className={styles.icon} aria-hidden="true" />
                          </Button>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      {verificationOpen && (
        <Dialog
          titleId={verificationTitleId}
          busy={startingVerification}
          onDismiss={() => setVerificationOpen(false)}
        >
          <DialogHeader>
            <h2 id={verificationTitleId} className={styles.heading}>
              {t('verification')}
            </h2>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('closeVerification')}
              disabled={startingVerification}
              onClick={() => setVerificationOpen(false)}
            >
              <Icon icon={closeIcon} className={styles.icon} aria-hidden="true" />
            </Button>
          </DialogHeader>
          <section className={styles.modalBody} aria-label={t('verification')}>
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
        </Dialog>
      )}
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
