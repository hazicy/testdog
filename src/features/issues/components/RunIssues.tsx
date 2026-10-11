'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { asset, time } from '@/features/runs/presentation';
import type { RunArtifact, TestRun } from '@/features/runs/types';
import {
  issueStatuses,
  issueSeverities,
  type Issue,
  type IssueOccurrence,
  type IssueStatus,
} from '../types';

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
  const { issue, occurrence } = entry;
  const snapshot = occurrence.snapshot;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const expected = snapshot.step?.assertion?.description ?? snapshot.nodeGoal ?? snapshot.goal;
  const actual = snapshot.step?.evidence ?? snapshot.error ?? issue.description;
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
      setError(cause instanceof Error ? cause.message : '更新失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="run-issue-card bg-surface-raised">
      <header className="run-issue-header">
        <div className="mb-3 flex items-center justify-between gap-3 text-xs">
          <span className="border border-error-line bg-error-soft px-2 py-1 font-mono text-error-ink">
            ISSUE {String(index + 1).padStart(2, '0')}
          </span>
          <Button className="ws-button" onClick={() => onSelect(entry)}>
            ▶ 回放问题 {time(issuePosition(run, occurrence))}
          </Button>
        </div>
        <h2 className="text-base font-semibold leading-6 break-words">{issue.title}</h2>
      </header>
      <div className="run-issue-body">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/^https?:\/\//.test(snapshot.url) && (
            <a
              href={snapshot.url}
              className="min-w-0 break-all text-page-muted hover:text-brand"
              target="_blank"
              rel="noreferrer"
            >
              ↗ {snapshot.url}
            </a>
          )}
          <span className="text-page-muted">严重程度：{issueSeverities[issue.severity]}</span>
        </div>
        <div className="grid gap-3 text-sm">
          <div className="min-w-0 border border-page-line">
            <h3 className="bg-surface-muted px-3 py-2 text-xs font-medium text-page-muted">
              预期 EXPECTED
            </h3>
            <p className="px-3 py-3 leading-5 whitespace-pre-wrap break-words">
              {expected || '未记录预期结果'}
            </p>
          </div>
          <div className="min-w-0 border border-error-line">
            <h3 className="bg-error-soft px-3 py-2 text-xs font-medium text-error-ink">
              实际 ACTUAL
            </h3>
            <p className="px-3 py-3 leading-5 whitespace-pre-wrap break-words">
              {actual || '未记录实际结果'}
            </p>
          </div>
        </div>
        <details open className="mt-5 border-b border-page-line pb-4 text-xs">
          <summary className="cursor-pointer font-medium text-page-muted">
            复现步骤 · {reproduction.length}
          </summary>
          <ol className="mt-3 space-y-2">
            {reproduction.map((title, position) => (
              <li key={position} className="flex gap-3 leading-5">
                <span className="font-mono text-page-muted">
                  {String(position + 1).padStart(2, '0')}
                </span>
                <span>{title}</span>
              </li>
            ))}
          </ol>
        </details>
        <details className="mt-5 border-b border-page-line pb-4 text-xs">
          <summary className="cursor-pointer font-medium text-page-muted">
            截图证据 · {screenshots.length}
          </summary>
          {screenshots.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {screenshots.map((frame) => (
                <Button
                  key={frame.id}
                  className="border border-page-line"
                  aria-label={`回放证据 ${time(frame.elapsedMs)}`}
                  onClick={() => onFrame(frame)}
                >
                  <Image
                    src={asset(run.id, frame)}
                    alt={`问题截图 ${time(frame.elapsedMs)}`}
                    width={160}
                    height={100}
                    unoptimized
                    className="h-24 w-40 object-contain"
                  />
                </Button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-page-muted">未归档截图证据。</p>
          )}
        </details>
        {error && (
          <p role="alert" className="mt-3 text-xs text-error-ink">
            {error}
          </p>
        )}
      </div>
      <footer className="run-issue-actions flex flex-wrap items-center gap-2">
        <Select
          aria-label={`问题状态：${issue.title}`}
          className="ws-input w-auto"
          value={issue.status}
          disabled={busy}
          onValueChange={(status) => void changeStatus(status)}
          items={Object.entries(issueStatuses).map(([value, label]) => ({ value, label }))}
        />
        <Button
          className="ws-button primary flex-1"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                [
                  `请修复以下问题：${issue.title}`,
                  `地址：${snapshot.url}`,
                  `预期：${expected}`,
                  `实际：${actual}`,
                  '复现步骤：',
                  ...reproduction.map((title, position) => `${position + 1}. ${title}`),
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
        <Link href={`/issues/${issue.id}`} className="text-xs text-brand hover:underline">
          查看问题详情 ↗
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
  const selectedIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.occurrence.id === selectedId),
  );
  const selected = entries[selectedIndex];

  return (
    <section aria-label="执行关联问题" className="run-issues-view bg-surface-raised">
      <div className="shrink-0 border-b border-page-line px-5 py-3">
        <p className="text-xs text-page-muted">本次执行 · {entries.length} 个问题</p>
        {entries.length > 1 && (
          <Select
            aria-label="选择执行问题"
            className="ws-input mt-3"
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
          <Button className="ws-button mt-3" disabled={loading} onClick={onLoadMore}>
            加载更多问题
          </Button>
        )}
      </div>
      {loading && !entries.length && (
        <p role="status" className="p-5 text-sm text-page-muted">
          正在加载关联问题…
        </p>
      )}
      {error && (
        <p role="alert" className="p-5 text-sm text-error-ink">
          无法加载关联问题：{error}
          <Button className="ml-2 underline" onClick={() => void onUpdated()}>
            重试
          </Button>
        </p>
      )}
      {!loading && !error && !selected && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <h2 className="text-sm font-medium">本次执行暂无关联问题</h2>
          <p className="text-xs leading-5 text-page-muted">
            自动发现的问题和手动关联的问题会显示在这里。
          </p>
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
