'use client';

import { useRunSubmission } from '@/client/useRunSubmission';
import { Button } from '@/components/ui/Button';
import { DockTabs, type DockTab } from '@/components/ui/DockTabs';

import { isActiveRun } from '@/features/runs/types';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ExecutionStep, RunArtifact, TestRun } from '@/features/runs/types';
import { api, fetchJson } from '@/client/api';
import useSWRInfinite from 'swr/infinite';
import type { IssuePage } from '@/features/issues/types';
import { ErrorState } from '@/components/shared/ErrorState';
import { downloadRunReport } from '@/client/download';
import { StepList } from './StepList';
import { stepAtTime } from '../lib/boardResults';
import { indexRun } from '@/features/runs/lib/runIndex';
import { useRunData } from '../hooks/useRunData';
import { useRunPlayback } from '../hooks/useRunPlayback';
import { RunHeader } from './RunHeader';
import { RunPlayer } from './RunPlayer';
import { BrowserLogPanel } from './BrowserLogPanel';
import { RunLogs } from './RunLogs';
import { StepDetails } from './StepDetails';
import { RunSnapshot } from './RunSnapshot';
import {
  RunIssues,
  issuePosition,
  type RunIssueEntry,
} from '@/features/issues/components/RunIssues';
import { time } from '../presentation';
import { IssueEditor } from '@/features/issues/components/IssueEditor';

import './run-studio.css';

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

type PanelId = (typeof workspaceTabs)[number]['id'];
type View = Exclude<PanelId, 'steps' | 'issues' | 'logs' | 'console' | 'network'>;

const emptySteps: ExecutionStep[] = [];

const PlanBoard = dynamic(() => import('./PlanBoard').then((module) => module.PlanBoard), {
  loading: () => (
    <p role="status" className="p-6 text-sm text-page-muted">
      正在加载计划画板…
    </p>
  ),
});
const RecordingEditor = dynamic(
  () => import('./RecordingEditor').then((module) => module.RecordingEditor),
  {
    loading: () => (
      <p role="status" className="p-6 text-sm text-page-muted">
        正在加载录制编辑器…
      </p>
    ),
  },
);

export function RunDetail({ id }: { id: string }) {
  const router = useRouter();
  const submit = useRunSubmission();
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueStep, setIssueStep] = useState<ExecutionStep>();
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const playback = useRunPlayback();
  const {
    follow,
    evidenceIndex,
    stepId,
    videoId,
    videoElement,
    elapsedMs,
    setPlaying,
    showFrame,
    seek,
    selectStep: selectPlaybackStep,
  } = playback;
  const [inspectedStepId, setInspectedStepId] = useState<string>();
  const [view, setView] = useState<View>('execution');
  const [logTab, setLogTab] = useState<'logs' | 'console' | 'network'>('logs');
  const [revealPanels, setRevealPanels] = useState<readonly PanelId[]>([]);
  const { run, error, setError, unavailable, now, previewUrl, clearPreview, refresh } = useRunData(
    id,
    follow && view === 'execution',
  );
  const [selectedIssueId, setSelectedIssueId] = useState<string>();
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

  useEffect(() => {
    if (view !== 'execution') videoElement.current?.pause();
  }, [view, videoElement]);
  const selectStep = useCallback(
    (step: ExecutionStep) => {
      setInspectedStepId(step.id);
      setSelectedIssueId(
        runIssues.find((entry) => entry.occurrence.stepId === step.id)?.occurrence.id,
      );
      setView('execution');
      setRevealPanels(['execution', 'steps']);
      const positions = stepFrames.get(step.id);

      const index = positions ? (positions.after ?? positions.first) : undefined;

      selectPlaybackStep(
        step.id,
        index === undefined
          ? Math.max(0, Date.parse(step.startedAt) - Date.parse(run?.startedAt || step.startedAt))
          : frames[index].elapsedMs,
        index,
      );
    },
    [stepFrames, selectPlaybackStep, frames, run?.startedAt, runIssues],
  );

  const selectRunIssue = useCallback(
    (entry: RunIssueEntry) => {
      if (!run) return;
      setSelectedIssueId(entry.occurrence.id);
      const step = run.steps.find((item) => item.id === entry.occurrence.stepId);

      if (step) setInspectedStepId(step.id);
      setView('execution');
      setRevealPanels(['execution', 'issues']);
      seek(issuePosition(run, entry.occurrence));
    },
    [run, seek],
  );

  const showIssueFrame = useCallback(
    (frame: RunArtifact) => {
      const index = frames.findIndex((item) => item.id === frame.id);

      if (index < 0) return;
      setInspectedStepId(frame.stepId);
      setView('execution');
      setRevealPanels(['execution', 'issues']);
      showFrame(index, frame.elapsedMs);
    },
    [frames, showFrame],
  );

  const renderStepIssue = useCallback(
    (step: ExecutionStep) =>
      run
        ? runIssues
            .filter((entry) => entry.occurrence.stepId === step.id)
            .map((entry) => (
              <div key={entry.occurrence.id} className="border-b border-page-line px-5 py-2">
                <Button
                  className="flex w-full items-start gap-2 text-left text-xs"
                  aria-label={`查看问题：${entry.issue.title}`}
                  onClick={() => selectRunIssue(entry)}
                >
                  <span className="shrink-0 border border-error-line bg-error-soft px-2 py-1 text-error-ink">
                    问题
                  </span>
                  <span className="min-w-0 flex-1 pt-1 font-medium break-words">
                    {entry.issue.title}
                  </span>
                  <span className="shrink-0 pt-1 font-mono text-page-muted">
                    ▶ {time(issuePosition(run, entry.occurrence))}
                  </span>
                </Button>
              </div>
            ))
        : null,
    [run, runIssues, selectRunIssue],
  );

  const selectBoardStep = useCallback(
    (step: ExecutionStep) => {
      selectStep(step);
      setRevealPanels(['execution', 'plan']);
    },
    [selectStep],
  );

  const showBoardFrame = useCallback(
    (frame: RunArtifact) => {
      const index = frames.findIndex((item) => item.id === frame.id);

      if (index < 0) return;
      setInspectedStepId(frame.stepId);
      setView('execution');
      setRevealPanels(['execution', 'plan']);
      showFrame(index, frame.elapsedMs);
    },
    [frames, showFrame],
  );

  const openIssue = useCallback((step: ExecutionStep) => {
    setIssueStep(step);
    setIssueOpen(true);
  }, []);

  const renderStepDetails = useCallback(
    (step: ExecutionStep) => (
      <StepDetails
        step={step}
        runError={run?.error}
        stepFrames={stepFrames}
        onIssue={openIssue}
        onShowFrame={(index) => {
          setView('execution');
          showFrame(index, frames[index].elapsedMs);
        }}
      />
    ),
    [run?.error, stepFrames, frames, showFrame, openIssue],
  );

  async function start(mode: 'record' | 'replay') {
    if (!run) return;
    setBusy(true);
    try {
      const data = await submit<{ run: TestRun }>(
        '/api/runs',
        mode === 'replay' ? { mode, sourceRunId: id } : { testId: run.testId },
      );

      router.push(`/runs/${data.run.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '启动失败');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await api.delete(`/api/runs/${id}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '停止失败');
    } finally {
      setBusy(false);
    }
  }

  async function exportReport() {
    setExporting(true);
    try {
      await downloadRunReport(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出失败');
    } finally {
      setExporting(false);
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
              onSelect={selectStep}
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
            onFrame={showIssueFrame}
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
            plan={run?.plan}
            steps={run?.steps || emptySteps}
            artifacts={run?.artifacts}
            results
            currentStepId={playbackStep?.id}
            onStep={selectBoardStep}
            onFrame={showBoardFrame}
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
          <div className="studio-content">
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

  function changePanel(panel: PanelId) {
    switch (panel) {
      case 'steps':
      case 'issues':
        return;
      case 'logs':
      case 'console':
      case 'network':
        setLogTab(panel);

        return;
      default:
        setView(panel);
        setPlaying(false);
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
    <div className="run-studio">
      <RunHeader
        id={id}
        run={run}
        now={now}
        busy={busy}
        exporting={exporting}
        start={start}
        cancel={cancel}
        exportReport={exportReport}
        onIssue={() => {
          setIssueStep(undefined);
          setIssueOpen(true);
        }}
      />
      {run?.evidenceComplete === false && (
        <p role="alert" className="studio-alert">
          本次执行的证据归档不完整，请查看执行错误。
        </p>
      )}
      {error && (
        <div role="alert" className="studio-alert flex justify-between gap-3">
          <span>{error}</span>
          <Button onClick={() => void refresh()} className="underline">
            刷新
          </Button>
        </div>
      )}
      {issueOpen && run && (
        <IssueEditor
          run={run}
          step={issueStep}
          onDismiss={() => setIssueOpen(false)}
          onSaved={(issue) => router.push(`/issues/${issue.id}`)}
        />
      )}
      <DockTabs
        key={id}
        label="执行工作台"
        className="run-studio-dock"
        tabs={workspaceTabs.map((tab) =>
          tab.id === 'issues' ? { ...tab, badge: runIssues.length } : tab,
        )}
        revealPanels={revealPanels}
        value={view}
        onChange={changePanel}
      >
        {renderPanel}
      </DockTabs>
    </div>
  );
}
