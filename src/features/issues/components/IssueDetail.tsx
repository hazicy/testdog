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
import { environmentLabel, relativeTime } from '../presentation';

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
  const latest = occurrences[0];
  const expected =
    latest?.snapshot.step?.assertion?.description ??
    latest?.snapshot.nodeGoal ??
    latest?.snapshot.goal;
  const actual = latest?.snapshot.step?.evidence ?? latest?.snapshot.error;
  const active = verifications.some((item) => item.outcome === 'pending');

  return (
    <article className="w-full p-6 md:px-10 md:py-6">
      <Link href="/issues" className="text-sm text-brand">
        ← 返回问题追踪
      </Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="bg-danger px-2 py-1 text-xs font-semibold text-white">
            {issue.category === 'product' ? 'BUG' : issueCategories[issue.category]}
          </span>
          <h1 className="text-xl font-semibold break-words">{issue.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="ws-button"
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
            className="ws-button"
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
          <Button className="ws-button shrink-0" onClick={() => setEditing(true)}>
            编辑问题
          </Button>
        </div>
      </div>
      <div className="my-4 flex flex-wrap items-center gap-4 text-xs text-page-muted">
        <span className="border border-page-line bg-surface-raised px-2 py-1">
          {environmentLabel(latest)}
        </span>
        <span>{new Set(occurrences.map((item) => item.runId)).size} 次执行</span>
        <span>首次出现 {relativeTime(occurrences.at(-1)?.createdAt ?? issue.createdAt)}</span>
        <span>最近出现 {relativeTime(latest?.createdAt ?? issue.createdAt)}</span>
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
      {latest && (
        <section className="mt-6" aria-label="最近出现">
          <h2 className="mb-3 text-sm font-semibold">最近出现</h2>
          <div className="border border-page-line bg-surface-raised">
            <div className="grid divide-page-line md:grid-cols-2 md:divide-x">
              <div>
                <h3 className="bg-surface-muted px-3 py-2 text-xs font-semibold text-page-muted">
                  预期 EXPECTED
                </h3>
                <p className="p-3 text-sm whitespace-pre-wrap">{expected || '未记录预期结果'}</p>
              </div>
              <div>
                <h3 className="bg-surface-muted px-3 py-2 text-xs font-semibold text-error-ink">
                  实际 ACTUAL
                </h3>
                <p className="p-3 text-sm whitespace-pre-wrap">{actual || '未记录实际结果'}</p>
              </div>
            </div>
            <div className="border-t border-page-line p-4 text-sm">
              {/^https?:\/\//.test(latest.snapshot.url) && (
                <a
                  className="break-all hover:text-brand"
                  href={latest.snapshot.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  ↗ {latest.snapshot.url}
                </a>
              )}
              <h3 className="mt-4 text-xs font-semibold text-page-muted">复现步骤 REPRODUCTION</h3>
              <ol className="mt-2 space-y-2">
                {(
                  latest.snapshot.reproduction ??
                  [latest.snapshot.goal, latest.snapshot.step?.title].filter(
                    (title): title is string => !!title,
                  )
                ).map((title, index) => (
                  <li key={index} className="flex gap-4">
                    <span className="font-mono text-xs text-page-muted">
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
      <p className="mt-4 whitespace-pre-wrap break-words border border-page-line bg-surface-raised p-4 text-sm">
        {issue.description || '尚未补充描述。'}
      </p>
      <section className="mt-8" aria-label="问题出现记录">
        <div className="mb-3 flex justify-between">
          <h2 className="text-sm font-semibold">出现记录 · {occurrences.length}</h2>
          <span className="text-xs text-page-muted">
            {new Set(occurrences.map((item) => item.runId)).size} 次执行 ·{' '}
            {new Set(occurrences.map(environmentLabel)).size} 个环境
          </span>
        </div>
        {occurrences.length > 0 && (
          <div className="overflow-x-auto border border-page-line bg-surface-raised">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted text-page-muted">
                <tr>
                  {['状态', '执行', '环境', '耗时', '开始时间'].map((title) => (
                    <th className="px-3 py-3 font-medium" key={title}>
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {occurrences.map((item) => (
                  <tr key={item.id} className="border-t border-page-line">
                    <td className="px-3 py-4">
                      <span className="border border-page-line px-2 py-1 text-xs">
                        {item.snapshot.runStatus === 'passed'
                          ? '通过'
                          : item.snapshot.runStatus === 'cancelled'
                            ? '已取消'
                            : item.snapshot.runStatus === 'failed' ||
                                item.snapshot.step?.status === 'failed'
                              ? '失败'
                              : '未知'}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <Link className="font-semibold hover:text-brand" href={`/runs/${item.runId}`}>
                        {item.snapshot.name}
                      </Link>
                    </td>
                    <td className="px-3 py-4">{environmentLabel(item)}</td>
                    <td className="px-3 py-4">
                      {item.snapshot.durationMs == null
                        ? '—'
                        : `${(item.snapshot.durationMs / 1000).toFixed(1)}s`}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap">
                      {relativeTime(item.snapshot.startedAt ?? item.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!occurrences.length && (
          <p className="text-sm text-page-muted">尚未关联测试执行，可从执行详情关联到此问题。</p>
        )}
        {occurrences.map((item) => (
          <div key={item.id} className="mt-4 border border-page-line bg-surface-raised p-4">
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
      <section className="mt-8" aria-label="回归验证">
        <h2 className="mb-4 text-lg font-semibold">回归验证</h2>
        {!verifications.length && (
          <p className="text-sm text-page-muted">
            从出现记录发起验证。通过后，请确认结果并标记已解决。
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
