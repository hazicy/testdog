'use client';

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
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ErrorState } from '@/components/shared/ErrorState';
import { asset } from '@/features/runs/presentation';
import {
  issueStatuses,
  issueCategories,
  issueSeverities,
  closeReasons,
  verificationLabels,
  type IssueDetail as Detail,
  type IssueOccurrence,
} from '@testdog/contracts/issues/types';
import { IssueEditor } from '@/features/issues/components/IssueEditor';
import { environmentLabel, relativeTime } from '@/features/issues/presentation';

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
      onError(cause instanceof Error ? cause.message : '启动失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <Select
        aria-label={`验证版本：${occurrence.snapshot.name}`}
        value={version}
        onValueChange={setVersion}
        className={styles.select}
        items={[
          {
            value: 'current',
            label: '当前用例 · 原执行目标',
            disabled: !occurrence.snapshot.testId,
          },
          ...(data?.versions.map((item) => ({
            value: item.id,
            label: `录制版本 · ${new Date(item.createdAt).toLocaleString('zh-CN')}`,
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
        {loadVersions ? '刷新录制版本' : '加载录制版本'}
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
        {busy ? '启动中…' : '发起回归验证'}
      </Button>
    </div>
  );
}

export function IssueDetail({ id }: { id: string }) {
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
  const [copied, setCopied] = useState(false);

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
      setError(cause instanceof Error ? cause.message : '提交失败');
    } finally {
      setBusy(false);
    }
  }

  if (loadError && !data)
    return (
      <ErrorState
        message={loadError.message || '无法加载问题'}
        retry={() => void mutate()}
        href="/issues"
        linkLabel="返回问题追踪"
      />
    );
  if (!data) return <LoadingState message="正在加载问题…" />;
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
        ← 返回问题追踪
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
                setError(cause instanceof Error ? cause.message : '更新失败');
              } finally {
                setBusy(false);
              }
            }}
          >
            {issue.status === 'closed' ? '重新打开' : '标记已解决'}
          </Button>
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  [
                    `请修复以下问题：${issue.title}`,
                    issue.description,
                    `地址：${latest?.snapshot.url ?? '未提供'}`,
                    `预期：${expected ?? '未提供'}`,
                    `实际：${actual ?? '未提供'}`,
                    '复现步骤：',
                    ...(latest?.snapshot.reproduction ?? []).map(
                      (title, index) => `${index + 1}. ${title}`,
                    ),
                  ].join('\n'),
                );
                setCopied(true);
              } catch {
                setError('复制失败，请检查浏览器剪贴板权限。');
              }
            }}
          >
            {copied ? '已复制修复提示词' : '复制修复提示词'}
          </Button>
          <Button className={styles.action} onClick={() => setEditing(true)}>
            编辑问题
          </Button>
        </div>
      </div>
      <div className={styles.metadata}>
        <span className={styles.environment}>{environmentLabel(latest)}</span>
        <span>{new Set(occurrences.map((item) => item.runId)).size} 次执行</span>
        <span>首次出现 {relativeTime(occurrences.at(-1)?.createdAt ?? issue.createdAt)}</span>
        <span>最近出现 {relativeTime(latest?.createdAt ?? issue.createdAt)}</span>
        <span>{issueStatuses[issue.status]}</span>
        <span>{issueCategories[issue.category]}</span>
        <span>{issueSeverities[issue.severity]}</span>
        {issue.closeReason && <span>关闭原因：{closeReasons[issue.closeReason]}</span>}
      </div>
      {(error || loadError) && (
        <p className={styles.loadError} role="alert">
          {error || loadError?.message}
        </p>
      )}
      {latest && (
        <section className={styles.section} aria-label="最近出现">
          <h2 className={styles.heading}>最近出现</h2>
          <div className={styles.latestOccurrence}>
            <div className={styles.comparison}>
              <div>
                <h3 className={styles.expectedHeading}>预期 EXPECTED</h3>
                <p className={styles.description}>{expected || '未记录预期结果'}</p>
              </div>
              <div>
                <h3 className={styles.actualHeading}>实际 ACTUAL</h3>
                <p className={styles.description}>{actual || '未记录实际结果'}</p>
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
              <h3 className={styles.reproductionHeading}>复现步骤 REPRODUCTION</h3>
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
      <p className={styles.issueDescription}>{issue.description || '尚未补充描述。'}</p>
      <section className={styles.historySection} aria-label="问题出现记录">
        <div className={styles.historyHeading}>
          <h2 className={styles.historyTitle}>出现记录 · {occurrences.length}</h2>
          <span className={styles.historySummary}>
            {new Set(occurrences.map((item) => item.runId)).size} 次执行 ·{' '}
            {new Set(occurrences.map(environmentLabel)).size} 个环境
          </span>
        </div>
        {occurrences.length > 0 && (
          <div className={styles.occurrenceTable}>
            <Table>
              <TableHeader className={styles.tableHeader}>
                <TableRow>
                  {['状态', '执行', '环境', '耗时', '开始时间'].map((title) => (
                    <TableHead className={styles.tableHead} key={title}>
                      {title}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {occurrences.map((item) => (
                  <TableRow key={item.id} className={styles.tableRow}>
                    <TableCell className={styles.tableCell}>
                      <span className={styles.runStatus}>
                        {item.snapshot.runStatus === 'passed'
                          ? '通过'
                          : item.snapshot.runStatus === 'cancelled'
                            ? '已取消'
                            : item.snapshot.runStatus === 'failed' ||
                                item.snapshot.step?.status === 'failed'
                              ? '失败'
                              : '未知'}
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
        {!occurrences.length && (
          <p className={styles.emptyMessage}>尚未关联测试执行，可从执行详情关联到此问题。</p>
        )}
        {occurrences.map((item) => (
          <div key={item.id} className={styles.occurrence}>
            <div className={styles.occurrenceHeading}>
              <strong>
                {item.snapshot.name} {item.snapshot.step && ` / ${item.snapshot.step.title}`}
              </strong>
              <Link className={styles.detailsLink} href={`/runs/${item.runId}`}>
                查看发现时的执行
              </Link>
            </div>
            <p className={styles.occurrenceMetadata}>
              {item.snapshot.target?.platform ?? 'web'} ·{' '}
              {new Date(item.createdAt).toLocaleString('zh-CN')}
            </p>
            {item.snapshot.step?.assertion && (
              <p className={styles.assertion}>预期：{item.snapshot.step.assertion.description}</p>
            )}
            {item.snapshot.step?.evidence && (
              <p className={styles.evidence}>验证证据：{item.snapshot.step.evidence}</p>
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
                      alt={`问题证据：${frame.stage === 'before' ? '执行前' : '执行后'}`}
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
      <section className={styles.historySection} aria-label="回归验证">
        <h2 className={styles.verificationHeading}>回归验证</h2>
        {!verifications.length && (
          <p className={styles.emptyMessage}>
            从出现记录发起验证。通过后，请确认结果并标记已解决。
          </p>
        )}
        {verifications.map((item) => (
          <div key={item.id} className={styles.verification}>
            <div className={styles.verificationSummary}>
              <strong>{verificationLabels[item.outcome]}</strong>
              <Link className={styles.detailsLink} href={`/runs/${item.runId}`}>
                查看回归执行
              </Link>
            </div>
            <p className={styles.verificationExplanation}>{item.explanation}</p>
          </div>
        ))}
      </section>
      <section className={styles.historySection} aria-label="处理记录">
        <h2 className={styles.verificationHeading}>处理记录</h2>
        <form onSubmit={addComment} className={styles.form}>
          <label className={styles.field}>
            补充处理说明
            <Textarea
              className={styles.input}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              required
              maxLength={10000}
            />
          </label>
          <Button className={styles.commentSubmit} type="submit" disabled={busy || !comment.trim()}>
            添加说明
          </Button>
        </form>
        <ol className={styles.events}>
          {events.map((event) => (
            <li key={event.id} className={styles.event}>
              <p className={styles.eventMessage}>{event.message}</p>
              <p className={styles.eventTime}>
                {new Date(event.createdAt).toLocaleString('zh-CN')}
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
