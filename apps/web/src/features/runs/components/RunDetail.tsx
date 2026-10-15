'use client';

import { useTranslations } from 'next-intl';

import { LoadingState } from '@/components/shared/LoadingState';

import clsx from 'clsx';

import styles from './RunDetail.module.css';
import studioStyles from '@/features/runs/components/run-studio.module.css';

import { useRunSubmission } from '@/client/useRunSubmission';
import { Button } from '@/components/ui/Button';
import { DockTabs } from '@/components/ui/DockTabs';
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
import type { EvidenceSource } from '@/features/runs/lib/runStudio';
import { runWorkspaceTabs, type PanelId } from '@/features/runs/lib/runLayout';
import { RunHeader } from '@/features/runs/components/RunHeader';
import { RunPlayer } from '@/features/runs/components/RunPlayer';
import { BrowserLogPanel } from '@/features/runs/components/BrowserLogPanel';
import { RunLogs } from '@/features/runs/components/RunLogs';
import { StepDetails } from '@/features/runs/components/StepDetails';
import {
  RunIssues,
  issuePosition,
  type RunIssueEntry,
} from '@/features/issues/components/RunIssues';
import { time } from '@/features/runs/presentation';
import { IssueEditor } from '@/features/issues/components/IssueEditor';

const emptySteps: ExecutionStep[] = [];

const PlanBoard = dynamic(
  () => import('@/features/runs/components/PlanBoard').then((module) => module.PlanBoard),
  {
    loading: () => <LoadingState />,
  },
);
const RecordingEditor = dynamic(
  () =>
    import('@/features/runs/components/RecordingEditor').then((module) => module.RecordingEditor),
  {
    loading: () => <LoadingState />,
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
  const t = useTranslations('runs');
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
                  aria-label={t('viewIssue', { title: entry.issue.title })}
                  onClick={() => selectRunIssue(entry)}
                >
                  <span className={styles.issueBadge}>{t('issue')}</span>
                  <span className={styles.issueTitle}>{entry.issue.title}</span>
                  <span className={styles.issueTime}>
                    ▶ {time(issuePosition(run, entry.occurrence))}
                  </span>
                </Button>
              </div>
            ))
        : null,
    [run, runIssues, selectRunIssue, t],
  );

  const openIssue = useCallback(
    (step: ExecutionStep) => {
      act({ type: 'issue', stepId: step.id });
    },
    [act],
  );

  const renderStepDetails = useCallback(
    (step: ExecutionStep) => <StepDetails step={step} runError={run?.error} />,
    [run?.error],
  );

  async function perform(action: 'record' | 'replay' | 'cancel' | 'export') {
    if ((action === 'record' || action === 'replay') && !run) return;
    const setPending = action === 'export' ? setExporting : setBusy;
    const failure =
      action === 'export'
        ? t('exportFailed')
        : action === 'cancel'
          ? t('stopFailed')
          : t('startFailed');

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
          <StepList
            plan={run?.plan}
            steps={run?.steps || emptySteps}
            selectedId={selectedStep?.id}
            running={run?.status === 'running'}
            onSelect={(step) => selectStep(step)}
            renderDetails={renderStepDetails}
            renderIssue={renderStepIssue}
          />
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
            trace={trace}
            previewUrl={previewUrl}
            clearPreview={clearPreview}
            playback={playback}
            durationMs={durationMs}
          />
        );
      case 'console':
      case 'network':
        return (
          <BrowserLogPanel
            runId={id}
            kind={panel}
            enabled={logTab === panel}
            active={!!run && isActiveRun(run.status) && logTab === panel}
            revision={run?.browserLogRevision ?? run?.realtimeRevision}
            elapsedMs={follow ? durationMs : elapsedMs}
            stepId={selectedStep?.id}
          />
        );
      case 'logs':
        return (
          <RunLogs
            id={id}
            run={run}
            onStep={(stepId) => {
              const step = steps.get(stepId);

              if (step) selectStep(step);
            }}
          />
        );
    }
  }

  if (unavailable || (!run && error))
    return (
      <ErrorState
        message={unavailable ? t('runNotFound') : error || t('runLoadFailed')}
        retry={() => void refresh()}
        href="/runs"
        linkLabel={t('backToRuns')}
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
          {t('incompleteEvidence')}
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
            {t('refresh')}
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
        label={t('workbench')}
        className={studioStyles.runStudioDock}
        tabs={runWorkspaceTabs(layout, runIssues.length).map((tab) => ({
          ...tab,
          label: t(`panels.${tab.id}`),
        }))}
        revealPanels={revealPanels}
        value={view}
        onChange={(panel) => act({ type: 'panel', panel })}
      >
        {renderPanel}
      </DockTabs>
    </div>
  );
}
