'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ExecutionStep, RunArtifact, TestRun } from '@/workspace/types';
import { PlanBoard } from './PlanBoard';
import { RecordingEditor } from './RecordingEditor';
import { WorkspaceIcon as Icon } from './WorkspaceIcon';
const statuses = { running: '执行中', passed: '已通过', failed: '失败', cancelled: '已停止' };
const kinds = { action: '操作', navigate: '导航', wait: '等待', assertion: '断言', branch: '分支' };
const time = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, '0')}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, '0')}`;
const asset = (runId: string, artifact: RunArtifact) =>
  `/api/runs/${runId}/artifacts/${artifact.id}`;
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '请求失败');
  return data;
}

export function RunDetail({ id }: { id: string }) {
  const router = useRouter();
  const [run, setRun] = useState<TestRun>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const [follow, setFollow] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);
  const [stepId, setStepId] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<'frames' | 'video'>('frames');
  const [videoId, setVideoId] = useState('');
  const [view, setView] = useState<'execution' | 'plan' | 'recording'>('execution');
  const [tab, setTab] = useState<'step' | 'case' | 'logs'>('step');
  const refresh = useCallback(async () => {
    try {
      const data = await request<{ run: TestRun }>(`/api/runs/${id}`);
      setRun(data.run);
      setNow(Date.now());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取执行记录');
    }
  }, [id]);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (run && run.status !== 'running') return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 1500);
    return () => clearInterval(timer);
  }, [refresh, run]);
  const frames = useMemo(
    () => run?.artifacts.filter((artifact) => artifact.kind === 'screenshot') || [],
    [run],
  );
  const videos = run?.artifacts.filter((artifact) => artifact.kind === 'video') || [];
  const trace = run?.artifacts.find((artifact) => artifact.kind === 'trace');
  const currentIndex = follow
    ? Math.max(0, frames.length - 1)
    : Math.min(frameIndex, frames.length - 1);
  const currentFrame = frames[currentIndex];
  const selectedStep =
    run?.steps.find((step) => step.id === stepId) ||
    (follow ? run?.steps.at(-1) : run?.steps.find((step) => step.id === currentFrame?.stepId));
  const video = videos.find((item) => item.id === videoId) || videos[0];
  useEffect(() => {
    if (!playing) return;
    const current = frames[currentIndex];
    const next = frames[currentIndex + 1];
    if (!next || !current) return;
    const timer = setTimeout(
      () => setFrameIndex(currentIndex + 1),
      Math.max(100, Math.min(3000, next.elapsedMs - current.elapsedMs)) / speed,
    );
    return () => clearTimeout(timer);
  }, [playing, frames, currentIndex, speed]);
  function selectStep(step: ExecutionStep) {
    setView('execution');
    setStepId(step.id);
    setTab('step');
    setMode('frames');
    setFollow(false);
    setPlaying(false);
    const index = frames.findIndex((frame) => frame.stepId === step.id && frame.stage === 'after');
    const before = frames.findIndex((frame) => frame.stepId === step.id);
    if (index >= 0 || before >= 0) setFrameIndex(index >= 0 ? index : before);
  }
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
  function exportReport() {
    const href = URL.createObjectURL(
      new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = href;
    link.download = `caseforge-${id}.json`;
    link.click();
    URL.revokeObjectURL(href);
  }
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
          {run?.status === 'running' ? (
            <button
              disabled={busy || run.cancelRequested}
              onClick={() => void cancel()}
              className="ws-button"
            >
              {run.cancelRequested ? '正在停止…' : '停止执行'}
            </button>
          ) : (
            run && (
              <>
                <button
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
                </button>
                {run.testId && (
                  <button
                    disabled={busy}
                    className="ws-button"
                    onClick={() => void start('record')}
                  >
                    重新录制
                  </button>
                )}
              </>
            )
          )}
          <button
            disabled={!run}
            className="ws-icon-button"
            aria-label="导出执行报告"
            title="导出执行报告"
            onClick={exportReport}
          >
            <Icon name="download" />
          </button>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="mt-5 flex justify-between gap-3 border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <span>{error}</span>
          <button onClick={() => void refresh()} className="underline">
            刷新
          </button>
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
          <button
            key={item.id}
            className={`ws-button ${view === item.id ? 'selected' : ''}`}
            aria-pressed={view === item.id}
            onClick={() => {
              setView(item.id);
              setPlaying(false);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {view === 'plan' && (
        <PlanBoard plan={run?.plan} steps={run?.steps || []} onStep={selectStep} />
      )}
      {run && run.status !== 'running' && (
        <div hidden={view !== 'recording'}>
          <RecordingEditor key={run.id} run={run} />
        </div>
      )}
      {view === 'recording' && run?.status === 'running' && (
        <p className="p-6 text-sm text-page-muted">录制结束后可以编辑操作和预期。</p>
      )}
      <div hidden={view !== 'execution'}>
        <div className="mt-7 grid overflow-hidden rounded-lg border border-page-line bg-[#fffefa] xl:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-label="浏览器画面" className="min-w-0 xl:border-r xl:border-page-line">
            <div className="flex h-12 items-center gap-3 border-b border-page-line px-4">
              <div className="flex gap-1.5" aria-hidden="true">
                <span className="h-2 w-2 rounded-full bg-[#e5ad98]" />
                <span className="h-2 w-2 rounded-full bg-[#dfcf9a]" />
                <span className="h-2 w-2 rounded-full bg-[#b9c3a4]" />
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
                  aria-label="放大浏览器画面"
                  title="放大浏览器画面"
                >
                  <Icon name="maximize" width="14" />
                </a>
              )}
              <span className="font-mono text-[9px] tracking-wider text-page-muted">
                {run?.status === 'running' && follow ? '实时画面' : '录制画面'}
              </span>
            </div>
            <div className="relative grid aspect-video place-items-center overflow-hidden bg-[#f0f1ec]">
              {mode === 'video' && video ? (
                <video
                  key={video.id}
                  aria-label="执行录像"
                  src={asset(id, video)}
                  controls
                  className="h-full w-full bg-[#20221c]"
                />
              ) : currentFrame ? (
                <Image
                  src={asset(id, currentFrame)}
                  alt={`浏览器画面：${currentFrame.pageUrl}`}
                  width={1280}
                  height={800}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="p-8 text-center">
                  <Icon name="globe" width="36" height="36" className="mx-auto text-[#959c86]" />
                  <p className="mt-5 text-sm text-[#69715b]">
                    {run?.status === 'running'
                      ? '浏览器正在准备，画面即将出现。'
                      : '本次执行尚未生成画面。'}
                  </p>
                </div>
              )}
            </div>
            <div className="border-t border-page-line px-4 py-4">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  className={`ws-button ${mode === 'frames' ? 'selected' : ''}`}
                  onClick={() => setMode('frames')}
                >
                  画面回看
                </button>
                <button
                  disabled={!videos.length}
                  className={`ws-button ${mode === 'video' ? 'selected' : ''}`}
                  onClick={() => setMode('video')}
                >
                  完整录像
                </button>
                {mode === 'video' && videos.length > 1 && (
                  <select
                    aria-label="录像页面"
                    value={video?.id || ''}
                    onChange={(event) => setVideoId(event.target.value)}
                    className="ws-input w-auto"
                  >
                    {videos.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.pageId}
                      </option>
                    ))}
                  </select>
                )}
                {run?.status === 'running' && (
                  <button
                    className={`ws-button ml-auto ${follow ? 'selected' : ''}`}
                    onClick={() => {
                      setFollow(true);
                      setStepId(undefined);
                      setPlaying(false);
                      setMode('frames');
                    }}
                  >
                    跟随实时画面
                  </button>
                )}
              </div>
              {mode === 'frames' && (
                <div className="flex items-center gap-3">
                  <button
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
                  </button>
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
                  <select
                    aria-label="回看速度"
                    value={speed}
                    onChange={(event) => setSpeed(Number(event.target.value))}
                    className="border border-page-line bg-transparent p-1 font-mono text-xs"
                  >
                    <option value={0.5}>0.5×</option>
                    <option value={1}>1×</option>
                    <option value={2}>2×</option>
                  </select>
                </div>
              )}
            </div>
          </section>
          <section aria-label="执行步骤" className="border-t border-page-line xl:border-t-0">
            <div className="flex h-12 items-center justify-between border-b border-page-line px-5">
              <h2 className="text-xs font-medium">执行步骤</h2>
              <span className="font-mono text-xs text-page-muted">
                {run?.steps.filter((step) => step.status === 'passed').length || 0} /{' '}
                {run?.steps.length || 0}
              </span>
            </div>
            <div className="max-h-[620px] overflow-y-auto">
              <ol>
                {run?.steps.map((step) => (
                  <li key={step.id}>
                    <button
                      onClick={() => selectStep(step)}
                      className={`flex w-full items-start gap-3 border-b border-page-line px-5 py-4 text-left transition-colors hover:bg-[#f2f1e9] ${selectedStep?.id === step.id ? 'bg-[#f3eee4]' : ''}`}
                    >
                      <span
                        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center border font-mono text-xs ${step.status === 'failed' ? 'border-red-200 text-red-600' : step.status === 'passed' ? 'border-[#cdd5bf] text-[#6c805b]' : 'border-brand text-brand'}`}
                      >
                        {step.status === 'passed'
                          ? '✓'
                          : step.status === 'failed'
                            ? '×'
                            : step.sequence.toString().padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-xs leading-5 text-ink">
                          {step.title}
                        </span>
                        <span className="mt-1.5 block font-mono text-[9px] text-page-muted">
                          {kinds[step.kind]} · {step.pageId} ·{' '}
                          {step.durationMs == null
                            ? step.status === 'running'
                              ? '执行中'
                              : '已中断'
                            : `${(step.durationMs / 1000).toFixed(1)}s`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {!run?.steps.length && (
                <p className="p-6 text-xs leading-6 text-page-muted">
                  {run?.status === 'running'
                    ? '正在生成测试计划，步骤将在执行时逐一出现。'
                    : '没有已执行的浏览器步骤。'}
                </p>
              )}
            </div>
          </section>
        </div>
        <div className="mt-6 overflow-hidden rounded-lg border border-page-line bg-[#fffefa]">
          <div className="flex flex-wrap items-center gap-x-5 border-b border-page-line px-5">
            {[
              { id: 'step' as const, label: '步骤详情' },
              { id: 'case' as const, label: '用例快照' },
              { id: 'logs' as const, label: '执行日志' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`whitespace-nowrap border-b-2 py-4 text-xs ${tab === item.id ? 'border-brand text-ink' : 'border-transparent text-page-muted'}`}
              >
                {item.label}
              </button>
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
                  {selectedStep.playwrightAssertion && (
                    <pre className="mt-4 whitespace-pre-wrap break-all border border-page-line p-4 text-xs leading-6">
                      {JSON.stringify(selectedStep.playwrightAssertion, null, 2)}
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
                    <p className="mt-4 text-xs leading-6 text-[#6c805b]">
                      验证证据：{selectedStep.evidence}
                    </p>
                  )}
                  {(selectedStep.error || run?.error) && (
                    <pre className="mt-4 whitespace-pre-wrap break-words border border-red-200 bg-red-50 p-4 text-xs leading-6 text-red-700">
                      {selectedStep.error || run?.error}
                    </pre>
                  )}
                  <div className="mt-4 flex gap-2">
                    {(['before', 'after'] as const).map((stage) => {
                      const index = frames.findIndex(
                        (frame) => frame.stepId === selectedStep.id && frame.stage === stage,
                      );
                      return (
                        <button
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
                        </button>
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
            ) : tab === 'case' ? (
              <>
                <p className="mb-3 text-xs text-page-muted">
                  执行时保存的版本，后续修改用例不会影响此记录。
                </p>
                <p className="whitespace-pre-wrap text-sm leading-8 text-ink">{run?.goal}</p>
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
