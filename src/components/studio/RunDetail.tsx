'use client';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';

import { BrowserLogPanel } from '../BrowserLogPanel';
import { isActiveRun } from '@/workspace/types';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ExecutionStep, RunArtifact, TestRun } from '@/workspace/types';
import { createJsonReader, HttpError, requestJson as request } from '@/client/api';
import { ErrorState } from '../shared/ErrorState';
import { usePolling } from '@/client/usePolling';
import { downloadRunReport } from '@/client/download';
import { WorkspaceIcon as Icon } from '../shared/WorkspaceIcon';
import { StepList } from './StepList';
import { indexRun } from '@/workspace/runIndex';
const statuses = {
  queued: '排队中',
  preparing: '准备中',
  finalizing: '归档中',
  running: '执行中',
  passed: '已通过',
  failed: '失败',
  cancelled: '已停止',
};
const emptySteps: ExecutionStep[] = [];
const time = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, '0')}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, '0')}`;
const asset = (runId: string, artifact: RunArtifact) =>
  `/api/runs/${runId}/artifacts/${artifact.id}`;
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
  const [run, setRun] = useState<TestRun>();
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [now, setNow] = useState(0);
  const [follow, setFollow] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);
  const [stepId, setStepId] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<'frames' | 'video'>('frames');
  const [videoId, setVideoId] = useState('');
  const videoElement = useRef<HTMLVideoElement>(null);
  const [view, setView] = useState<'execution' | 'plan' | 'recording'>('execution');
  const [editorOpened, setEditorOpened] = useState(false);
  const [tab, setTab] = useState<'step' | 'case' | 'logs' | 'console' | 'network'>('step');
  const read = useMemo(() => createJsonReader<{ run: TestRun }>(`/api/runs/${id}`), [id]);
  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const data = await read({ signal });
        if (signal.aborted) return;
        setRun(data.run);
        setNow(Date.now());
        setError('');
        setUnavailable(false);
      } catch (cause) {
        if (signal.aborted) return;
        setError(cause instanceof Error ? cause.message : '无法读取执行记录');
        setUnavailable(
          cause instanceof HttpError && (cause.status === 400 || cause.status === 404),
        );
      }
    },
    [read],
  );
  const refresh = usePolling(load, unavailable || (run && !isActiveRun(run.status)) ? null : 1500);
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
  }, [playing, frames, currentIndex, speed, mode, view]);
  useEffect(() => {
    if (view !== 'execution') videoElement.current?.pause();
  }, [view]);
  const selectStep = useCallback(
    (step: ExecutionStep) => {
      setView('execution');
      setStepId(step.id);
      setTab('step');
      setMode('frames');
      setFollow(false);
      setPlaying(false);
      const positions = stepFrames.get(step.id);
      if (positions) setFrameIndex(positions.after ?? positions.first);
    },
    [stepFrames],
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
      <Link
        href="/runs"
        className="mb-6 inline-flex items-center gap-2 text-xs text-page-muted hover:text-brand"
      >
        ← 返回执行记录
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-3 font-mono text-xs text-page-muted">执行记录 / {id.slice(0, 8)}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {run?.name || '加载执行记录…'}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-page-muted">
            {run && (
              <>
                <span className={`ws-status ${run.status}`}>
                  <span />
                  {statuses[run.status]}
                </span>
                <span className="font-mono">{run.mode === 'replay' ? '重放' : '录制'}</span>
                <span>{run.steps.length} 个步骤</span>
                <span>{time(run.durationMs ?? Math.max(0, now - Date.parse(run.startedAt)))}</span>
                {run.sourceRunId && (
                  <Link className="underline underline-offset-4" href={`/runs/${run.sourceRunId}`}>
                    查看原记录 ↗
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {run && isActiveRun(run.status) ? (
            <Button
              disabled={busy || run.cancelRequested}
              onClick={() => void cancel()}
              className="ws-button"
            >
              {run.cancelRequested ? '正在停止…' : '停止执行'}
            </Button>
          ) : (
            run && (
              <>
                <Button
                  disabled={busy || !run.replayable}
                  title={
                    run.replayable
                      ? '按记录的动作顺序重新执行，重新验证断言'
                      : '需要成功执行且每个操作都有稳定定位器'
                  }
                  className="ws-button primary"
                  onClick={() => void start('replay')}
                >
                  <Icon name="results" width="14" /> 重放操作
                </Button>
                {run.testId && (
                  <Button
                    disabled={busy}
                    className="ws-button"
                    onClick={() => void start('record')}
                  >
                    重新录制
                  </Button>
                )}
              </>
            )
          )}
          <Button
            disabled={!run || exporting}
            className="ws-icon-button"
            aria-label="导出执行报告"
            title="导出执行报告"
            onClick={() => void exportReport()}
          >
            <Icon name="download" />
          </Button>
        </div>
      </div>
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
          <section aria-label="浏览器画面" className="min-w-0 xl:border-r xl:border-page-line">
            <div className="flex h-12 items-center gap-3 border-b border-page-line px-4">
              <div className="flex gap-1.5" aria-hidden="true">
                <span className="h-2 w-2 rounded-full bg-window-close" />
                <span className="h-2 w-2 rounded-full bg-window-minimize" />
                <span className="h-2 w-2 rounded-full bg-window-expand" />
              </div>
              <span className="ml-2 min-w-0 flex-1 truncate font-mono text-xs text-page-muted">
                {currentFrame?.pageUrl || run?.url || 'Browser session'}
              </span>
              {currentFrame && (
                <a
                  href={asset(id, currentFrame)}
                  target="_blank"
                  rel="noreferrer"
                  className="ws-icon-button shrink-0"
                  aria-label="放大执行画面"
                  title="放大执行画面"
                >
                  <Icon name="maximize" width="14" />
                </a>
              )}
              <span className="font-mono text-[9px] tracking-wider text-page-muted">
                {run && isActiveRun(run.status) && follow ? '● LIVE' : 'RECORDING'}
              </span>
            </div>
            <div className="relative grid aspect-video place-items-center overflow-hidden bg-preview">
              {mode === 'video' && video ? (
                <video
                  ref={videoElement}
                  key={video.id}
                  aria-label="执行录像"
                  src={asset(id, video)}
                  controls
                  className="h-full w-full bg-preview-dark"
                />
              ) : currentFrame ? (
                <Image
                  src={asset(id, currentFrame)}
                  alt={`执行画面：${currentFrame.pageUrl || currentFrame.surface?.id || ''}`}
                  width={1280}
                  height={800}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="p-8 text-center">
                  <Icon name="globe" width="36" height="36" className="mx-auto text-preview-icon" />
                  <p className="mt-5 text-sm text-preview-ink">
                    {run && isActiveRun(run.status)
                      ? run.status === 'queued'
                        ? '执行已排队，等待可用资源。'
                        : '执行环境正在准备，画面即将出现。'
                      : '本次执行尚未生成画面。'}
                  </p>
                </div>
              )}
            </div>
            <div className="border-t border-page-line px-4 py-4">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button
                  className={`ws-button ${mode === 'frames' ? 'selected' : ''}`}
                  onClick={() => setMode('frames')}
                >
                  画面回看
                </Button>
                <Button
                  disabled={!videos.length}
                  title={
                    !run?.capabilities?.artifacts.includes('video')
                      ? '此会话不采集录像'
                      : '归档完成后可回看录像'
                  }
                  className={`ws-button ${mode === 'video' ? 'selected' : ''}`}
                  onClick={() => {
                    setPlaying(false);
                    setMode('video');
                  }}
                >
                  完整录像
                </Button>
                {mode === 'video' && videos.length > 1 && (
                  <Select
                    aria-label="录像页面"
                    value={video?.id || ''}
                    onValueChange={(value) => setVideoId(value)}
                    className="ws-input w-auto"
                    items={[videos.map((item) => ({ value: item.id, label: <>{item.pageId}</> }))]}
                  />
                )}
                {run && isActiveRun(run.status) && (
                  <Button
                    className={`ws-button ml-auto ${follow ? 'selected' : ''}`}
                    onClick={() => {
                      setFollow(true);
                      setStepId(undefined);
                      setPlaying(false);
                      setMode('frames');
                    }}
                  >
                    跟随实时画面
                  </Button>
                )}
              </div>
              {mode === 'frames' && (
                <div className="flex items-center gap-3">
                  <Button
                    className="ws-icon-button"
                    disabled={frames.length < 2}
                    aria-label={
                      playing && currentIndex < frames.length - 1 ? '暂停回看' : '播放回看'
                    }
                    onClick={() => {
                      setFollow(false);
                      setStepId(undefined);
                      if (currentIndex >= frames.length - 1) setFrameIndex(0);
                      else setFrameIndex(currentIndex);
                      setPlaying(!(playing && currentIndex < frames.length - 1));
                    }}
                  >
                    <Icon
                      name={playing && currentIndex < frames.length - 1 ? 'pause' : 'results'}
                      width="17"
                    />
                  </Button>
                  <span className="font-mono text-xs text-page-muted">
                    {time(currentFrame?.elapsedMs || 0)}
                  </span>
                  <input
                    aria-label="画面时间轴"
                    type="range"
                    min={0}
                    max={Math.max(0, frames.length - 1)}
                    value={Math.max(0, currentIndex)}
                    disabled={!frames.length}
                    onChange={(event) => {
                      setFollow(false);
                      setPlaying(false);
                      setStepId(undefined);
                      setFrameIndex(Number(event.target.value));
                    }}
                    className="min-w-0 flex-1 accent-brand"
                  />
                  <span className="font-mono text-xs text-page-muted">
                    {time(frames.at(-1)?.elapsedMs || 0)}
                  </span>
                  <Select
                    aria-label="回看速度"
                    value={speed}
                    onValueChange={(value) => setSpeed(Number(value))}
                    className="border border-page-line bg-transparent p-1 font-mono text-xs"
                    items={[
                      { value: 0.5, label: '0.5×' },
                      { value: 1, label: '1×' },
                      { value: 2, label: '2×' },
                    ]}
                  />
                </div>
              )}
            </div>
          </section>
          <StepList
            steps={run?.steps || emptySteps}
            selectedId={selectedStep?.id}
            running={run?.status === 'running'}
            onSelect={selectStep}
          />
        </div>
        <div className="mt-6 overflow-hidden rounded-lg border border-page-line bg-surface">
          <div className="flex flex-wrap items-center gap-x-5 border-b border-page-line px-5">
            {[
              { id: 'step' as const, label: '步骤详情' },
              { id: 'case' as const, label: '用例快照' },
              { id: 'logs' as const, label: '执行日志' },
              { id: 'console' as const, label: 'Console' },
              { id: 'network' as const, label: 'Network' },
            ].map((item) => (
              <Button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`whitespace-nowrap border-b-2 py-4 text-xs ${tab === item.id ? 'border-brand text-ink' : 'border-transparent text-page-muted'}`}
              >
                {item.label}
              </Button>
            ))}
            <div className="ml-auto flex w-full gap-3 pb-3 sm:w-auto sm:pb-0">
              {video && (
                <a
                  className="text-xs text-page-muted hover:text-brand"
                  href={`${asset(id, video)}?download`}
                >
                  下载录像 ↗
                </a>
              )}
              {diagnostics.length > 0 && (
                <details className="relative text-[10px] text-page-muted">
                  <summary className="cursor-pointer">观察与诊断 ({diagnostics.length})</summary>
                  <div className="absolute right-0 z-10 max-h-60 min-w-48 overflow-auto border border-page-line bg-surface-raised p-3">
                    {diagnostics.map((artifact) => (
                      <a
                        key={artifact.id}
                        className="block py-1 hover:text-brand"
                        href={`${asset(id, artifact)}?download`}
                      >
                        {artifact.kind} · {artifact.stage} ·{' '}
                        {(artifact.elapsedMs / 1000).toFixed(1)}s ↗
                      </a>
                    ))}
                  </div>
                </details>
              )}
              {trace && (
                <a className="text-xs text-page-muted hover:text-brand" href={asset(id, trace)}>
                  下载 Trace ↗
                </a>
              )}
            </div>
          </div>
          <div className="p-5 sm:p-6">
            {tab === 'step' ? (
              selectedStep ? (
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-sm font-medium">{selectedStep.title}</h3>
                    <span className={`ws-status ${selectedStep.status}`}>
                      <span />
                      {statuses[selectedStep.status]}
                    </span>
                  </div>
                  <p className="mt-3 break-all font-mono text-xs text-page-muted">
                    {selectedStep.pageId} / {selectedStep.pageUrl}
                  </p>
                  {selectedStep.platformAssertion && (
                    <pre className="mt-4 whitespace-pre-wrap break-all border border-page-line p-4 text-xs">
                      {JSON.stringify(selectedStep.platformAssertion, null, 2)}
                    </pre>
                  )}
                  {selectedStep.playwrightAssertion && (
                    <pre className="mt-4 whitespace-pre-wrap break-all border border-page-line p-4 text-xs leading-6">
                      {JSON.stringify(selectedStep.playwrightAssertion, null, 2)}
                    </pre>
                  )}
                  {selectedStep.platformAction && (
                    <pre className="whitespace-pre-wrap break-all text-xs">
                      {JSON.stringify(selectedStep.platformAction, null, 2)}
                    </pre>
                  )}
                  {selectedStep.action && (
                    <div className="mt-4 border border-page-line bg-page p-4 font-mono text-xs leading-6">
                      <p>action: {selectedStep.action.type}</p>
                      {'target' in selectedStep.action && (
                        <p className="break-all">
                          target: {selectedStep.action.target.kind} /{' '}
                          {selectedStep.action.target.name || selectedStep.action.target.value}
                        </p>
                      )}
                      {selectedStep.action.value && (
                        <p className="break-all">
                          value:{' '}
                          {selectedStep.action.sensitive ? '••••••••' : selectedStep.action.value}
                        </p>
                      )}
                    </div>
                  )}
                  {selectedStep.evidence && (
                    <p className="mt-4 text-xs leading-6 text-step-success">
                      验证证据：{selectedStep.evidence}
                    </p>
                  )}
                  {(selectedStep.error || run?.error) && (
                    <pre className="mt-4 whitespace-pre-wrap break-words border border-error-line bg-error-soft p-4 text-xs leading-6 text-error-ink">
                      {selectedStep.error || run?.error}
                    </pre>
                  )}
                  <div className="mt-4 flex gap-2">
                    {(['before', 'after'] as const).map((stage) => {
                      const index = stepFrames.get(selectedStep.id)?.[stage] ?? -1;
                      return (
                        <Button
                          key={stage}
                          disabled={index < 0}
                          className="ws-button"
                          onClick={() => {
                            setFollow(false);
                            setPlaying(false);
                            setMode('frames');
                            setFrameIndex(index);
                          }}
                        >
                          {stage === 'before' ? '查看执行前' : '查看执行后'}
                        </Button>
                      );
                    })}
                    {!selectedStep.replayable && (
                      <span className="self-center text-xs text-page-muted">
                        本步骤缺少稳定定位器，无法重放操作。
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-page-muted">
                  {run?.error || '选择右侧步骤，查看操作、验证证据和前后画面。'}
                </p>
              )
            ) : tab === 'console' || tab === 'network' ? (
              run?.targetSnapshot && run.targetSnapshot.platform !== 'web' ? (
                <p className="text-sm text-page-muted">
                  当前设备会话没有采集 {tab === 'console' ? '浏览器控制台' : '网络'}{' '}
                  记录。截图与步骤证据保存在执行时间线中。
                </p>
              ) : (
                <BrowserLogPanel
                  logs={run?.browserLogs || []}
                  kind={tab}
                  stepId={selectedStep?.id}
                  elapsedMs={currentFrame?.elapsedMs}
                />
              )
            ) : tab === 'case' ? (
              <>
                <p className="mb-3 text-xs text-page-muted">
                  执行时保存的版本，后续修改用例不会影响此记录。
                </p>
                <p className="whitespace-pre-wrap text-sm leading-8 text-ink">{run?.goal}</p>
                <details className="mt-5 text-xs text-page-muted">
                  <summary className="cursor-pointer">平台目标与实际执行环境</summary>
                  <pre className="mt-3 whitespace-pre-wrap break-all">
                    {JSON.stringify(
                      {
                        target: run?.targetSnapshot,
                        environment: run?.environmentSnapshot,
                        capabilities: run?.capabilities,
                        batchId: run?.batchId,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </>
            ) : (
              <div className="font-mono text-xs leading-7">
                {run?.events.map((event, index) => (
                  <div key={index} className="flex gap-4">
                    <span className="shrink-0 text-page-muted">
                      {new Date(event.at).toLocaleTimeString('zh-CN')}
                    </span>
                    <span className="text-ink">{event.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
