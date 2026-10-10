'use client';

import Image from 'next/image';
import { Slider } from '@base-ui/react/slider';
import { useEffect, useState } from 'react';
import type { useRunPlayback } from '../hooks/useRunPlayback';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Icon } from '@iconify/react/offline';
import pauseIcon from '@iconify-icons/lucide/pause';
import resultsIcon from '@iconify-icons/lucide/play';
import { isActiveRun, type TestRun, type RunArtifact } from '@/features/runs/types';
import { asset, time } from '../presentation';
import { actionIcon } from '../lib/actionIcon';

type Props = {
  id: string;
  run?: TestRun;
  currentFrame?: RunArtifact;
  frames: RunArtifact[];
  videos: RunArtifact[];
  video?: RunArtifact;
  previewUrl?: string;
  clearPreview: () => void;
  durationMs: number;
  playback: ReturnType<typeof useRunPlayback>;
};

export function RunPlayer({
  id,
  run,
  currentFrame,
  frames,
  videos,
  video,
  previewUrl,
  clearPreview,
  durationMs,
  playback,
}: Props) {
  const [dimensions, setDimensions] = useState({ width: 1280, height: 800 });
  const [videoDuration, setVideoDuration] = useState(0);
  const [failedVideo, setFailedVideo] = useState<string>();
  const { follow, playing, speed, videoElement, elapsedMs, setElapsedMs } = playback;
  const active = !!run && isActiveRun(run.status);
  const useVideo = !!video && failedVideo !== video.id && !active && !playback.inspectingEvidence;
  const total = useVideo ? videoDuration || durationMs : durationMs;
  const position =
    useVideo || playing ? elapsedMs : follow ? currentFrame?.elapsedMs || 0 : elapsedMs;

  useEffect(() => {
    if (!playing || useVideo) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const delta = (now - previous) * speed;

      previous = now;
      setElapsedMs((elapsed) => Math.min(total, elapsed + delta));
    }, 50);

    return () => clearInterval(timer);
  }, [playing, useVideo, speed, total, setElapsedMs]);
  const marks = (run?.steps || []).flatMap((step) => {
    const before = frames.find((frame) => frame.stepId === step.id && frame.stage === 'before');
    const elapsed = before?.elapsedMs ?? Date.parse(step.startedAt) - Date.parse(run!.startedAt);

    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > total) return [];

    return [{ step, elapsed, percent: total ? (elapsed / total) * 100 : 0 }];
  });
  const setPlaying = playback.setPlaying;

  useEffect(() => {
    if (!useVideo && elapsedMs >= total) setPlaying(false);
  }, [useVideo, elapsedMs, total, setPlaying]);

  function seek(ms: number) {
    playback.seek(ms);
  }

  function toggle() {
    if (useVideo && videoElement.current) playback.toggleVideo();
    else playback.togglePlayback(position, total);
  }

  return (
    <section aria-label="浏览器画面" className="studio-panel">
      <div className="studio-panel-toolbar">
        <span className="font-mono text-xs text-page-muted">
          {dimensions.width} × {dimensions.height} ·{' '}
          {active && follow
            ? '● LIVE'
            : run?.targetSnapshot?.platform === 'web' || !run?.targetSnapshot
              ? 'BROWSER'
              : run.targetSnapshot.platform.toUpperCase()}
        </span>
      </div>
      <div className="run-replay-panel">
        <div className="run-replay-surface">
          {useVideo ? (
            <video
              ref={videoElement}
              key={video?.id}
              aria-label="执行录像"
              src={video ? asset(id, video) : undefined}
              className="h-full w-full object-contain"
              playsInline
              preload="auto"
              onLoadedMetadata={(event) => {
                playback.seek(elapsedMs);
                event.currentTarget.currentTime = elapsedMs / 1000;
                event.currentTarget.playbackRate = speed;
                const duration = event.currentTarget.duration;

                setDimensions({
                  width: event.currentTarget.videoWidth || 1280,
                  height: event.currentTarget.videoHeight || 800,
                });

                if (Number.isFinite(duration)) setVideoDuration(duration * 1000);
              }}
              onDurationChange={(event) => {
                const duration = event.currentTarget.duration;

                if (Number.isFinite(duration)) setVideoDuration(duration * 1000);
              }}
              onTimeUpdate={(event) => setElapsedMs(event.currentTarget.currentTime * 1000)}
              onPlay={() => playback.setPlaying(true)}
              onPause={() => playback.setPlaying(false)}
              onEnded={() => playback.setPlaying(false)}
              onError={() => {
                setFailedVideo(video?.id);
                playback.setPlaying(false);
              }}
            />
          ) : previewUrl && follow ? (
            <Image
              src={previewUrl}
              alt="实时执行画面"
              width={1280}
              height={800}
              unoptimized
              onError={clearPreview}
              className="h-full w-full object-contain"
            />
          ) : currentFrame ? (
            <Image
              src={asset(id, currentFrame)}
              alt={`执行画面：${currentFrame.pageUrl || currentFrame.surface?.id || ''}`}
              width={1280}
              height={800}
              unoptimized
              onLoad={(event) =>
                setDimensions({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              className="h-full w-full object-contain"
            />
          ) : (
            <p className="p-8 text-sm text-preview-ink">
              {active ? '执行环境正在准备，画面即将出现。' : '本次执行尚未生成画面。'}
            </p>
          )}
        </div>
        <div className="studio-panel-toolbar run-replay-controls">
          <Button
            className="ws-icon-button primary"
            disabled={!useVideo && frames.length < 2}
            aria-label={playing ? '暂停回看' : '播放回看'}
            onClick={toggle}
          >
            <Icon icon={playing ? pauseIcon : resultsIcon} width="20" aria-hidden="true" />
          </Button>
          <span aria-label="回放时间" className="whitespace-nowrap font-mono text-xs tabular-nums">
            {time(position)} / {time(total)}
          </span>
          <div className="relative h-11 min-w-24 flex-1">
            <Slider.Root
              className="h-full"
              min={0}
              max={Math.max(1, total)}
              step={1}
              value={Math.min(total, position)}
              disabled={!total}
              onValueChange={seek}
              onValueCommitted={seek}
            >
              <Slider.Control
                data-testid="replay-timeline"
                className="relative flex h-full w-full touch-none items-center select-none"
              >
                <Slider.Track className="relative h-1 w-full rounded bg-page-line">
                  <Slider.Indicator className="h-full rounded bg-brand" />
                  {marks.map(({ step, percent }) => (
                    <span
                      key={step.id}
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 h-2 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-page-muted"
                      style={{ left: `${percent}%` }}
                    />
                  ))}
                  <Slider.Thumb
                    aria-label="画面时间轴"
                    className="h-3 w-3 rounded-full bg-brand outline-offset-4 focus-visible:outline-2 focus-visible:outline-brand"
                  />
                </Slider.Track>
              </Slider.Control>
            </Slider.Root>
            <div className="absolute inset-x-0 top-1/2 mt-2 h-5" aria-label="回放动作标记">
              {marks.map(({ step, elapsed, percent }) => (
                <Button
                  key={step.id}
                  aria-label={`跳转动作：${step.title}`}
                  title={`${time(elapsed)} · ${step.title}`}
                  onClick={() => seek(elapsed)}
                  className={`absolute top-0 grid h-5 w-5 -translate-x-1/2 place-items-center rounded bg-surface hover:bg-page focus-visible:outline-2 focus-visible:outline-brand ${step.status === 'failed' ? 'text-error-ink' : 'text-page-muted hover:text-brand'}`}
                  style={{ left: `${percent}%` }}
                >
                  <Icon icon={actionIcon(step)} aria-hidden="true" width="12" height="12" />
                </Button>
              ))}
            </div>
          </div>
          <Select
            aria-label="回看速度"
            value={speed}
            onValueChange={(value) => playback.setSpeed(Number(value))}
            className="border border-page-line bg-transparent p-1 font-mono text-xs"
            items={[
              { value: 0.5, label: '0.5×' },
              { value: 1, label: '1×' },
              { value: 2, label: '2×' },
            ]}
          />
          {useVideo && videos.length > 1 && (
            <Select
              aria-label="录像页面"
              value={video?.id || ''}
              onValueChange={(value) => {
                setVideoDuration(0);
                setElapsedMs(0);
                playback.setVideoId(value);
              }}
              className="ws-input w-auto"
              items={videos.map((item) => ({ value: item.id, label: item.pageId }))}
            />
          )}
          {active && (
            <Button
              className={`ws-button ${follow ? 'selected' : ''}`}
              onClick={playback.followLive}
            >
              跟随实时画面
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
