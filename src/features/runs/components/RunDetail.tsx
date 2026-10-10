'use client';
import { Button } from '@/components/ui/Button';

import { isActiveRun } from '@/workspace/types';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ExecutionStep, TestRun } from '@/workspace/types';
import { requestJson as request } from '@/client/api';
import { ErrorState } from '@/components/shared/ErrorState';
import { downloadRunReport } from '@/client/download';
import { StepList } from './StepList';
import { indexRun } from '@/workspace/runIndex';
import { useRunData } from '../hooks/useRunData';
import { useRunPlayback } from '../hooks/useRunPlayback';
import { RunHeader } from './RunHeader';
import { RunPlayer } from './RunPlayer';
import { RunInspector, type InspectorTab } from './RunInspector';

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
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const playback = useRunPlayback();
  const {
    follow,
    frameIndex,
    stepId,
    playing,
    speed,
    mode,
    videoId,
    videoElement,
    setFrameIndex,
    setPlaying,
    selectStep: selectPlaybackStep,
  } = playback;
  const [view, setView] = useState<'execution' | 'plan' | 'recording'>('execution');
  const [editorOpened, setEditorOpened] = useState(false);
  const [tab, setTab] = useState<InspectorTab>('step');
  const { run, error, setError, unavailable, now, previewUrl, clearPreview, refresh } = useRunData(
    id,
    follow && mode === 'frames' && view === 'execution',
  );
  const { frames, videos, trace, stepFrames, steps } = useMemo(() => indexRun(run), [run]);
  const diagnostics =
    run?.artifacts.filter((artifact) =>
      ['snapshot', 'log', 'device-trace'].includes(artifact.kind),
    ) || [];
  const currentIndex = follow
    ? Math.max(0, frames.length - 1)
    : Math.min(frameIndex, frames.length - 1);
  const currentFrame = frames[currentIndex];
  const selectedStep =
    steps.get(stepId || '') || (follow ? run?.steps.at(-1) : steps.get(currentFrame?.stepId || ''));
  const video = videos.find((item) => item.id === videoId) || videos[0];

  useEffect(() => {
    if (!playing || mode !== 'frames' || view !== 'execution') return;
    const current = frames[currentIndex];
    const next = frames[currentIndex + 1];
    if (!next || !current) return;
    const timer = setTimeout(
      () => setFrameIndex(currentIndex + 1),
      Math.max(100, Math.min(3000, next.elapsedMs - current.elapsedMs)) / speed,
    );

    return () => clearTimeout(timer);
  }, [playing, frames, currentIndex, speed, mode, view, setFrameIndex]);
  useEffect(() => {
    if (view !== 'execution') videoElement.current?.pause();
  }, [view, videoElement]);
  const selectStep = useCallback(
    (step: ExecutionStep) => {
      setView('execution');
      setTab('step');
      const positions = stepFrames.get(step.id);

      selectPlaybackStep(step.id, positions ? (positions.after ?? positions.first) : undefined);
    },
    [stepFrames, selectPlaybackStep],
  );

  async function start(mode: 'record' | 'replay') {
    if (!run) return;
    setBusy(true);
    try {
      const data = await request<{ run: TestRun }>('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'replay' ? { mode, sourceRunId: id } : { testId: run.testId },
        ),
      });

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
      await request(`/api/runs/${id}`, { method: 'DELETE' });
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
    <div className="mx-auto max-w-[1500px]">
      <RunHeader
        id={id}
        run={run}
        now={now}
        busy={busy}
        exporting={exporting}
        start={start}
        cancel={cancel}
        exportReport={exportReport}
      />
      {run?.evidenceComplete === false && (
        <p role="alert" className="mt-5 border border-error-line p-4 text-sm text-error-ink">
          本次执行的证据归档不完整，请查看执行错误。
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="mt-5 flex justify-between gap-3 border border-error-line bg-error-soft p-4 text-sm text-error-ink"
        >
          <span>{error}</span>
          <Button onClick={() => void refresh()} className="underline">
            刷新
          </Button>
        </div>
      )}
      <nav className="mt-7 mb-5 flex flex-wrap gap-2" aria-label="执行视图">
        {(
          [
            { id: 'execution', label: '执行回放' },
            { id: 'plan', label: '计划画板' },
            { id: 'recording', label: '编辑录制' },
          ] as const
        ).map((item) => (
          <Button
            key={item.id}
            className={`ws-button ${view === item.id ? 'selected' : ''}`}
            aria-pressed={view === item.id}
            onClick={() => {
              setView(item.id);
              if (item.id === 'recording') setEditorOpened(true);
              setPlaying(false);
            }}
          >
            {item.label}
          </Button>
        ))}
      </nav>
      {view === 'plan' && (
        <PlanBoard plan={run?.plan} steps={run?.steps || []} onStep={selectStep} />
      )}
      {editorOpened && run && !isActiveRun(run.status) && (
        <div hidden={view !== 'recording'}>
          <RecordingEditor key={run.id} run={run} />
        </div>
      )}
      {view === 'recording' && run && isActiveRun(run.status) && (
        <p className="p-6 text-sm text-page-muted">录制结束后可以编辑操作和预期。</p>
      )}
      <div hidden={view !== 'execution'}>
        <div className="mt-7 grid overflow-hidden rounded-lg border border-page-line bg-surface xl:grid-cols-[minmax(0,1fr)_320px]">
          <RunPlayer
            id={id}
            run={run}
            currentFrame={currentFrame}
            currentIndex={currentIndex}
            frames={frames}
            videos={videos}
            video={video}
            previewUrl={previewUrl}
            clearPreview={clearPreview}
            playback={playback}
          />
          <StepList
            steps={run?.steps || emptySteps}
            selectedId={selectedStep?.id}
            running={run?.status === 'running'}
            onSelect={selectStep}
          />
        </div>
        <RunInspector
          id={id}
          run={run}
          tab={tab}
          setTab={setTab}
          selectedStep={selectedStep}
          currentFrame={currentFrame}
          video={video}
          trace={trace}
          diagnostics={diagnostics}
          stepFrames={stepFrames}
          onShowFrame={playback.showFrame}
        />
      </div>
    </div>
  );
}
