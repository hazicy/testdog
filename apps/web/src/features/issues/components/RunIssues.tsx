'use client';

import { classNames } from '@/components/ui/classNames';

import studioStyles from '@/features/runs/components/run-studio.module.css';
import styles from './RunIssues.module.css';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/client/api';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { asset, time } from '@/features/runs/presentation';
import type { RunArtifact, TestRun } from '@testdog/contracts/runs/types';
import {
  issueStatuses,
  issueSeverities,
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
    <article className={classNames(studioStyles.runIssueCard, styles.article)}>
      <header className={studioStyles.runIssueHeader}>
        <div className={styles.container}>
          <span className={styles.label}>ISSUE {String(index + 1).padStart(2, '0')}</span>
          <Button onClick={() => onSelect(entry)}>
            ▶ 回放问题 {time(issuePosition(run, occurrence))}
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
          <span className={styles.mutedText}>严重程度：{issueSeverities[issue.severity]}</span>
        </div>
        <div className={styles.comparison}>
          <div className={styles.expected}>
            <h3 className={styles.subheading}>预期 EXPECTED</h3>
            <p className={styles.description}>{expected || '未记录预期结果'}</p>
          </div>
          <div className={styles.actual}>
            <h3 className={styles.actualHeading}>实际 ACTUAL</h3>
            <p className={styles.description}>{actual || '未记录实际结果'}</p>
          </div>
        </div>
        <details open className={styles.details}>
          <summary className={styles.summary}>复现步骤 · {reproduction.length}</summary>
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
          <summary className={styles.summary}>截图证据 · {screenshots.length}</summary>
          {screenshots.length ? (
            <div className={styles.screenshots}>
              {screenshots.map((frame) => (
                <Button
                  key={frame.id}
                  variant="ghost"
                  className={styles.action}
                  aria-label={`回放证据 ${time(frame.elapsedMs)}`}
                  onClick={() => onFrame(frame)}
                >
                  <Image
                    src={asset(run.id, frame)}
                    alt={`问题截图 ${time(frame.elapsedMs)}`}
                    width={160}
                    height={100}
                    unoptimized
                    className={styles.image}
                  />
                </Button>
              ))}
            </div>
          ) : (
            <p className={styles.emptyEvidence}>未归档截图证据。</p>
          )}
        </details>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
      <footer className={classNames(studioStyles.runIssueActions, styles.footer)}>
        <Select
          aria-label={`问题状态：${issue.title}`}
          className={styles.select}
          value={issue.status}
          disabled={busy}
          onValueChange={(status) => void changeStatus(status)}
          items={Object.entries(issueStatuses).map(([value, label]) => ({ value, label }))}
        />
        <Button
          variant="primary"
          className={styles.copyPrompt}
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
        <Link href={`/issues/${issue.id}`} className={styles.detailsLink}>
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
    <section
      aria-label="执行关联问题"
      className={classNames(studioStyles.runIssuesView, styles.article)}
    >
      <div className={styles.toolbar}>
        <p className={styles.issueCount}>本次执行 · {entries.length} 个问题</p>
        {entries.length > 1 && (
          <Select
            aria-label="选择执行问题"
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
            加载更多问题
          </Button>
        )}
      </div>
      {loading && !entries.length && (
        <p role="status" className={styles.loading}>
          正在加载关联问题…
        </p>
      )}
      {error && (
        <p role="alert" className={styles.loadError}>
          无法加载关联问题：{error}
          <Button
            variant="ghost"
            size="sm"
            className={styles.retry}
            onClick={() => void onUpdated()}
          >
            重试
          </Button>
        </p>
      )}
      {!loading && !error && !selected && (
        <div className={styles.emptyState}>
          <h2 className={styles.emptyTitle}>本次执行暂无关联问题</h2>
          <p className={styles.emptyHint}>自动发现的问题和手动关联的问题会显示在这里。</p>
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
