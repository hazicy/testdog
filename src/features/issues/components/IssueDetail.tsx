'use client';

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
} from '../types';
import { IssueEditor } from './IssueEditor';

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
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Select
        aria-label={`验证版本：${occurrence.snapshot.name}`}
        value={version}
        onValueChange={setVersion}
        className="ws-input w-auto"
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
        className="ws-button"
        onClick={() => {
          if (loadVersions) void refreshVersions();
          else setLoadVersions(true);
        }}
        disabled={isLoading}
      >
        {loadVersions ? '刷新录制版本' : '加载录制版本'}
      </Button>
      {versionsError && (
        <p role="alert" className="text-sm text-error-ink">
          {versionsError.message}
        </p>
      )}
      <Button
        className="ws-button primary"
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
        title="无法加载问题"
        message={loadError.message}
        retry={() => void mutate()}
        href="/issues"
        linkLabel="返回问题追踪"
      />
    );
  if (!data)
    return (
      <p className="p-8" role="status">
        正在加载问题…
      </p>
    );
  const { issue, occurrences, events, verifications } = data;
  const active = verifications.some((item) => item.outcome === 'pending');

  return (
    <article className="mx-auto max-w-5xl p-6 md:p-10">
      <Link href="/issues" className="text-sm text-brand">
        ← 返回问题追踪
      </Link>
      <div className="mt-5 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold break-words">{issue.title}</h1>
        <Button className="ws-button shrink-0" onClick={() => setEditing(true)}>
          编辑问题
        </Button>
      </div>
      <div className="my-4 flex flex-wrap gap-4 text-sm text-page-muted">
        <span>{issueStatuses[issue.status]}</span>
        <span>{issueCategories[issue.category]}</span>
        <span>{issueSeverities[issue.severity]}</span>
        {issue.closeReason && <span>关闭原因：{closeReasons[issue.closeReason]}</span>}
      </div>
      {(error || loadError) && (
        <p className="mb-4 text-error-ink" role="alert">
          {error || loadError?.message}
        </p>
      )}
      <p className="whitespace-pre-wrap break-words rounded-lg border border-page-line p-5">
        {issue.description || '尚未补充描述。'}
      </p>
      <section className="mt-8" aria-label="回归验证">
        <h2 className="mb-4 text-lg font-semibold">回归验证</h2>
        {!verifications.length && (
          <p className="text-sm text-page-muted">
            从下方出现记录发起验证。通过后，请确认结果并在编辑问题中关闭。
          </p>
        )}
        {verifications.map((item) => (
          <div key={item.id} className="mb-3 rounded-lg border border-page-line p-4">
            <div className="flex justify-between">
              <strong>{verificationLabels[item.outcome]}</strong>
              <Link className="text-brand" href={`/runs/${item.runId}`}>
                查看回归执行
              </Link>
            </div>
            <p className="mt-2 text-sm text-page-muted">{item.explanation}</p>
          </div>
        ))}
      </section>
      <section className="mt-8" aria-label="问题出现记录">
        <h2 className="mb-4 text-lg font-semibold">出现记录 · {occurrences.length}</h2>
        {!occurrences.length && (
          <p className="text-sm text-page-muted">尚未关联测试执行，可从执行详情关联到此问题。</p>
        )}
        {occurrences.map((item) => (
          <div key={item.id} className="mb-5 rounded-lg border border-page-line p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <strong>
                {item.snapshot.name} {item.snapshot.step && ` / ${item.snapshot.step.title}`}
              </strong>
              <Link className="text-brand" href={`/runs/${item.runId}`}>
                查看发现时的执行
              </Link>
            </div>
            <p className="mt-2 text-xs text-page-muted">
              {item.snapshot.target?.platform ?? 'web'} ·{' '}
              {new Date(item.createdAt).toLocaleString('zh-CN')}
            </p>
            {item.snapshot.step?.assertion && (
              <p className="mt-3 text-sm">预期：{item.snapshot.step.assertion.description}</p>
            )}
            {item.snapshot.step?.evidence && (
              <p className="mt-2 text-sm">验证证据：{item.snapshot.step.evidence}</p>
            )}
            {item.snapshot.error && (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-error-ink">
                {item.snapshot.error}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
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
                      className="h-28 w-48 rounded border border-page-line object-contain"
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
      <section className="mt-8" aria-label="处理记录">
        <h2 className="mb-4 text-lg font-semibold">处理记录</h2>
        <form onSubmit={addComment} className="mb-6">
          <label className="block">
            补充处理说明
            <textarea
              className="ws-input mt-2 min-h-24"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              required
              maxLength={10000}
            />
          </label>
          <Button className="ws-button mt-3" type="submit" disabled={busy || !comment.trim()}>
            添加说明
          </Button>
        </form>
        <ol className="space-y-4">
          {events.map((event) => (
            <li key={event.id} className="border-l-2 border-page-line pl-4">
              <p className="whitespace-pre-wrap break-words text-sm">{event.message}</p>
              <p className="mt-1 text-xs text-page-muted">
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
