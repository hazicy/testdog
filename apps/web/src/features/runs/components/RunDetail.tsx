'use client';

import clsx from 'clsx';

import styles from './RunDetail.module.css';
import studioStyles from '@/features/runs/components/run-studio.module.css';

import { useRunSubmission } from '@/client/useRunSubmission';
import { Button } from '@/components/ui/Button';
import { DockTabs, type DockTab } from '@/components/ui/DockTabs';
import { isActiveRun } from '@testdog/contracts/runs/types';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ExecutionStep, RunArtifact, TestRun } from '@testdog/contracts/runs/types';
import { api, fetchJson } from '@/client/api';
import useSWRInfinite from 'swr/infinite';
import type { IssuePage } from '@testdog/contracts/issues/types';
import { ErrorState } from '@/components/shared/ErrorState';
import { downloadRunReport } from '@/client/download';
import { StepList } from '@/features/runs/components/StepList';
import { stepAtTime } from '@/features/runs/lib/boardResults';
import { indexRun } from '@/features/runs/lib/runIndex';
import { useRunData } from '@/features/runs/hooks/useRunData';
import { useRunStudio } from '@/features/runs/hooks/useRunStudio';
import type { EvidenceSource, PanelId } from '@/features/runs/lib/runStudio';
import { RunHeader } from '@/features/runs/components/RunHeader';
import { RunPlayer } from '@/features/runs/components/RunPlayer';
import { BrowserLogPanel } from '@/features/runs/components/BrowserLogPanel';
import { RunLogs } from '@/features/runs/components/RunLogs';
import { StepDetails } from '@/features/runs/components/StepDetails';
import { RunSnapshot } from '@/features/runs/components/RunSnapshot';
import {
  RunIssues,
  issuePosition,
  type RunIssueEntry,
} from '@/features/issues/components/RunIssues';
import { time } from '@/features/runs/presentation';
import { IssueEditor } from '@/features/issues/components/IssueEditor';

const workspaceTabs = [
  { id: 'steps', label: '执行步骤', initiallyVisible: true, initialWidthRatio: 0.382 },
  { id: 'issues', label: '问题', reference: 'steps' },
  { id: 'plan', label: '计划画板', reference: 'steps' },
  {
    id: 'execution',
    label: '执行回放',
    reference: 'steps',
    direction: 'right',
    initiallyVisible: true,
  },
  { id: 'recording', label: '编辑录制', reference: 'execution' },
  {
    id: 'logs',
    label: '执行日志',
    reference: 'execution',
    direction: 'below',
    initialHeight: 260,
    initiallyCollapsed: true,
  },
  { id: 'console', label: 'Console', reference: 'logs' },
  { id: 'network', label: 'Network', reference: 'logs' },
] as const satisfies readonly DockTab[];

const emptySteps: ExecutionStep[] = [];

const PlanBoard = dynamic(
  () => import('@/features/runs/components/PlanBoard').then((module) => module.PlanBoard),
  {
    loading: () => (
      <p role="status" className={styles.loading}>
        正在加载计划画板…
      </p>
    ),
  },
);
const RecordingEditor = dynamic(
  () =>
    import('@/features/runs/components/RecordingEditor').then((module) => module.RecordingEditor),
  {
    loading: () => (
      <p role="status" className={styles.loading}>
        正在加载录制编辑器…
      </p>
    ),
  },
);

export function RunDetail({
  id,
  embedded = false,
  onRunChange,
  onRunCreated,
}: {
  id: string;
  embedded?: boolean;
  onRunChange?: (run: TestRun) => void;
  onRunCreated?: (run: TestRun) => void;
}) {
  const router = useRouter();
  const submit = useRunSubmission();
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { state, act, playback } = useRunStudio();
  const {
    layoutVersion,
    layout,
    inspectedStepId,
    view,
    logTab,
    revealPanels,
    selectedIssueId,
    issueStepId,
  } = state;
  const { follow, evidenceIndex, stepId, videoId, elapsedMs } = playback;
  const { run, error, setError, unavailable, previewUrl, clearPreview, refresh } = useRunData(
    id,
    follow && view === 'execution',
  );

  useEffect(() => {
    if (run) onRunChange?.(run);
  }, [run, onRunChange]);
  const {
    data: issuePages,
    error: issuesError,
    isLoading: issuesLoading,
    mutate: refreshIssues,
    size: issuePageCount,
    setSize: setIssuePageCount,
  } = useSWRInfinite<IssuePage>(
    (index, previous) => {
      if (!run || (index && !previous?.nextCursor)) return null;
      const params = new URLSearchParams({ runId: id });

      if (index) params.set('cursor', previous!.nextCursor!);

      return `/api/issues?${params}`;
    },
    fetchJson,
    { refreshInterval: 5000 },
  );
  const runIssues = useMemo(
    () =>
      issuePages?.flatMap((page) =>
        page.issues.flatMap((issue) =>
          (
            issue.runOccurrences ??
            (issue.latestOccurrence?.runId === id ? [issue.latestOccurrence] : [])
          ).map((occurrence) => ({ issue, occurrence })),
        ),
      ) ?? [],
    [issuePages, id],
  );
  const { frames, videos, trace, stepFrames, steps } = useMemo(() => indexRun(run), [run]);
  const diagnostics =
    run?.artifacts.filter((artifact) =>
      ['snapshot', 'log', 'device-trace'].includes(artifact.kind),
    ) || [];
  const currentIndex = follow
    ? Math.max(0, frames.length - 1)
    : (evidenceIndex ??
      Math.max(
        0,
        frames.findLastIndex((frame) => frame.elapsedMs <= elapsedMs),
      ));
  const currentFrame = frames[currentIndex];
  const playbackStep = follow
    ? run?.steps.at(-1)
    : stepId
      ? steps.get(stepId)
      : evidenceIndex !== undefined
        ? steps.get(currentFrame?.stepId || '')
        : run
          ? stepAtTime(run, elapsedMs)
          : undefined;
  const selectedStep = steps.get(inspectedStepId || '') || playbackStep;
  const video = videos.find((item) => item.id === videoId) || videos[0];

  const durationMs = Math.max(run?.durationMs || 0, frames.at(-1)?.elapsedMs || 0);

  const selectStep = useCallback(
    (step: ExecutionStep, source: EvidenceSource = 'steps') => {
      const positions = stepFrames.get(step.id);
      const index = positions ? (positions.after ?? positions.first) : undefined;

      act({
        type: 'inspect',
        source,
        stepId: step.id,
        issueId: runIssues.find((entry) => entry.occurrence.stepId === step.id)?.occurrence.id,
        cursor: { kind: 'evidence', stepId: step.id, index },
        elapsedMs:
          index === undefined
            ? Math.max(0, Date.parse(step.startedAt) - Date.parse(run?.startedAt || step.startedAt))
            : frames[index].elapsedMs,
      });
    },
    [stepFrames, act, frames, run?.startedAt, runIssues],
  );

  const selectRunIssue = useCallback(
    (entry: RunIssueEntry) => {
      if (!run) return;
      act({
        type: 'inspect',
        source: 'issues',
        stepId: entry.occurrence.stepId ?? undefined,
        issueId: entry.occurrence.id,
        cursor: { kind: 'timeline' },
        elapsedMs: issuePosition(run, entry.occurrence),
      });
    },
    [run, act],
  );

  const showFrame = useCallback(
    (frame: RunArtifact, source: EvidenceSource) => {
      const index = frames.findIndex((item) => item.id === frame.id);

      if (index < 0) return;
      act({
        type: 'inspect',
        source,
        stepId: frame.stepId,
        issueId:
          (source === 'issues' ? selectedIssueId : undefined) ??
          runIssues.find((entry) => entry.occurrence.stepId === frame.stepId)?.occurrence.id,
        cursor: { kind: 'evidence', index },
        elapsedMs: frame.elapsedMs,
      });
    },
    [frames, runIssues, selectedIssueId, act],
  );

  const renderStepIssue = useCallback(
    (step: ExecutionStep) =>
      run
        ? runIssues
            .filter((entry) => entry.occurrence.stepId === step.id)
            .map((entry) => (
              <div key={entry.occurrence.id} className={styles.container}>
                <Button
                  variant="ghost"
                  className={styles.action}
                  aria-label={`查看问题：${entry.issue.title}`}
                  onClick={() => selectRunIssue(entry)}
                >
                  <span className={styles.issueBadge}>问题</span>
                  <span className={styles.issueTitle}>{entry.issue.title}</span>
                  <span className={styles.issueTime}>
                    ▶ {time(issuePosition(run, entry.occurrence))}
                  </span>
                </Button>
              </div>
            ))
        : null,
    [run, runIssues, selectRunIssue],
  );

  const openIssue = useCallback(
    (step: ExecutionStep) => {
      act({ type: 'issue', stepId: step.id });
    },
    [act],
  );

  const renderStepDetails = useCallback(
    (step: ExecutionStep) => (
      <StepDetails
        step={step}
        runError={run?.error}
        stepFrames={stepFrames}
        onIssue={openIssue}
        onShowFrame={(index) => {
          showFrame(frames[index], 'steps');
        }}
      />
    ),
    [run?.error, stepFrames, frames, showFrame, openIssue],
  );

  async function perform(action: 'record' | 'replay' | 'cancel' | 'export') {
    if ((action === 'record' || action === 'replay') && !run) return;
    const setPending = action === 'export' ? setExporting : setBusy;
    const failure =
      action === 'export' ? '导出失败' : action === 'cancel' ? '停止失败' : '启动失败';

    setPending(true);
    try {
      switch (action) {
        case 'export':
          await downloadRunReport(id);
          break;
        case 'cancel':
          await api.delete(`/api/runs/${id}`);
          await refresh();
          break;
        default: {
          const data = await submit<{ run: TestRun }>(
            '/api/runs',
            action === 'replay' ? { mode: action, sourceRunId: id } : { testId: run!.testId },
          );

          if (onRunCreated) onRunCreated(data.run);
          else router.push(`/runs/${data.run.id}`);
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failure);
    } finally {
      setPending(false);
    }
  }

  function renderPanel(panel: PanelId) {
    switch (panel) {
      case 'steps':
        return (
          <div>
            <RunSnapshot run={run} />
            <StepList
              steps={run?.steps || emptySteps}
              selectedId={selectedStep?.id}
              running={run?.status === 'running'}
              onSelect={(step) => selectStep(step)}
              renderDetails={renderStepDetails}
              renderIssue={renderStepIssue}
            />
          </div>
        );
      case 'issues':
        return run ? (
          <RunIssues
            entries={runIssues}
            run={run}
            selectedId={
              selectedIssueId ??
              runIssues.find((entry) => entry.occurrence.stepId === selectedStep?.id)?.occurrence.id
            }
            onSelect={selectRunIssue}
            onFrame={(frame) => showFrame(frame, 'issues')}
            onUpdated={refreshIssues}
            error={issuesError?.message}
            loading={issuesLoading}
            hasMore={!!issuePages?.at(-1)?.nextCursor}
            onLoadMore={() => void setIssuePageCount(issuePageCount + 1)}
          />
        ) : null;
      case 'plan':
        return (
          <PlanBoard
            fullHeight
            plan={run?.plan}
            steps={run?.steps || emptySteps}
            artifacts={run?.artifacts}
            results
            currentStepId={playbackStep?.id}
            onStep={(step) => selectStep(step, 'plan')}
            onFrame={(frame) => showFrame(frame, 'plan')}
            onIssue={openIssue}
          />
        );
      case 'recording':
        return run ? <RecordingEditor key={run.id} run={run} /> : null;
      case 'execution':
        return (
          <RunPlayer
            id={id}
            run={run}
            currentFrame={currentFrame}
            frames={frames}
            videos={videos}
            video={video}
            previewUrl={previewUrl}
            clearPreview={clearPreview}
            playback={playback}
            durationMs={durationMs}
          />
        );
      case 'console':
      case 'network':
        return (
          <div className={studioStyles.studioContent}>
            <BrowserLogPanel
              runId={id}
              kind={panel}
              enabled={logTab === panel}
              active={!!run && isActiveRun(run.status) && logTab === panel}
              revision={run?.browserLogRevision ?? run?.realtimeRevision}
              elapsedMs={elapsedMs}
            />
          </div>
        );
      case 'logs':
        return <RunLogs id={id} run={run} video={video} trace={trace} diagnostics={diagnostics} />;
    }
  }

  if (unavailable || (!run && error))
    return (
      <ErrorState
        title={unavailable ? '执行记录不存在' : '无法加载执行记录'}
        message={error}
        retry={() => void refresh()}
        href="/runs"
        linkLabel="返回执行记录"
      />
    );

  return (
    <div data-ui="run-studio" className={studioStyles.runStudio}>
      <RunHeader
        id={id}
        embedded={embedded}
        run={run}
        layout={layout}
        changeLayout={(layout) => act({ type: 'layout', layout })}
        busy={busy}
        exporting={exporting}
        start={(mode) => perform(mode)}
        cancel={() => perform('cancel')}
        exportReport={() => perform('export')}
      />
      {run?.evidenceComplete === false && (
        <p role="alert" className={studioStyles.studioAlert}>
          本次执行的证据归档不完整，请查看执行错误。
        </p>
      )}
      {error && (
        <div role="alert" className={clsx(studioStyles.studioAlert, styles.error)}>
          <span>{error}</span>
          <Button
            onClick={() => void refresh()}
            variant="ghost"
            size="sm"
            className={styles.refresh}
          >
            刷新
          </Button>
        </div>
      )}
      {issueStepId && run && (
        <IssueEditor
          run={run}
          step={steps.get(issueStepId)}
          onDismiss={() => act({ type: 'issue' })}
          onSaved={(issue) => {
            if (embedded) {
              act({ type: 'issue' });
              window.open(`/issues/${issue.id}`, '_blank', 'noopener,noreferrer');
            } else router.push(`/issues/${issue.id}`);
          }}
        />
      )}
      <DockTabs
        key={`${id}:${layoutVersion}`}
        label="执行工作台"
        className={studioStyles.runStudioDock}
        tabs={workspaceTabs
          .map((tab): DockTab & { id: PanelId } => {
            const configured: DockTab & { id: PanelId } = {
              ...tab,
              ...(tab.id === 'issues' ? { badge: runIssues.length } : {}),
            };

            if (layout === 'focus') {
              return {
                ...configured,
                reference: tab.id === 'steps' ? undefined : 'steps',
                direction: 'within',
                initiallyVisible: tab.id === 'execution',
                initiallyCollapsed: false,
                initialWidthRatio: undefined,
                initialHeight: undefined,
              };
            }

            if (layout === 'default') return configured;
            if (tab.id === 'steps') configured.initialWidthRatio = 0.28;
            if (tab.id === 'logs') configured.initiallyCollapsed = false;
            if (layout === 'review' && tab.id === 'issues') {
              configured.reference = 'execution';
              configured.direction = 'right';
              configured.initiallyVisible = true;
              configured.initialWidthRatio = 0.28;
            }

            if (layout === 'notes' || layout === 'debug') {
              if (tab.id === 'logs') {
                configured.direction = 'right';
                configured.initialWidthRatio = 0.28;
                configured.initiallyVisible = layout === 'debug';
              }

              if (tab.id === 'issues') {
                configured.reference = 'logs';
                configured.direction = 'below';
                configured.initiallyVisible = true;
                configured.initialHeight = 260;
              }

              if (tab.id === 'console') configured.initiallyVisible = layout === 'notes';
            }

            return configured;
          })
          .sort((a, b) => {
            // Create referenced panels before the panels positioned relative to them.
            const order: PanelId[] = [
              'steps',
              'execution',
              'logs',
              'issues',
              'plan',
              'recording',
              'console',
              'network',
            ];

            return order.indexOf(a.id) - order.indexOf(b.id);
          })}
        revealPanels={revealPanels}
        value={view}
        onChange={(panel) => act({ type: 'panel', panel })}
      >
        {renderPanel}
      </DockTabs>
    </div>
  );
}
