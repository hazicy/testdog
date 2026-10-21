'use client';

import { useTranslations } from 'next-intl';

import clsx from 'clsx';

import studioStyles from '@/features/runs/components/run-studio.module.css';
import styles from './RunPlayer.module.css';

import Image from 'next/image';
import { Slider } from '@base-ui/react/slider';
import { useEffect, useState } from 'react';
import type { useRunStudio } from '@/features/runs/hooks/useRunStudio';
import { Button } from '@/components/ui/Button';
import { buttonStyles } from '@/components/ui/buttonStyles';
import { Tooltip } from '@/components/ui/Tooltip';
import { Select } from '@/components/ui/Select';
import { Icon } from '@iconify/react/offline';
import videoIcon from '@iconify-icons/lucide/video';
import archiveIcon from '@iconify-icons/lucide/file-archive';
import pauseIcon from '@iconify-icons/lucide/pause';
import resultsIcon from '@iconify-icons/lucide/play';
import { isActiveRun, type TestRun, type RunArtifact } from '@testdog/contracts/runs/types';
import { asset, time } from '@/features/runs/presentation';
import { actionIcon } from '@/features/runs/lib/actionIcon';

type Props = {
  id: string;
  run?: TestRun;
  currentFrame?: RunArtifact;
  frames: RunArtifact[];
  videos: RunArtifact[];
  video?: RunArtifact;
  trace?: RunArtifact;
  previewUrl?: string;
  clearPreview: () => void;
  durationMs: number;
  artifactUrl?: (artifact: RunArtifact) => string;
  playback: ReturnType<typeof useRunStudio>['playback'];
};

export function RunPlayer({
  id,
  run,
  currentFrame,
  frames,
  videos,
  video,
  trace,
  previewUrl,
  clearPreview,
  durationMs,
  artifactUrl = (artifact) => asset(id, artifact),
  playback,
}: Props) {
  const t = useTranslations('runs');
  const [videoDuration, setVideoDuration] = useState(0);
  const [failedVideo, setFailedVideo] = useState<string>();
  const { follow, playing, speed, videoElement, elapsedMs, setElapsedMs } = playback;
  const active = !!run && isActiveRun(run.status);
  const useVideo = !!video && failedVideo !== video.id && !active && !playback.inspectingEvidence;
  const total = useVideo ? videoDuration || durationMs : durationMs;
  const livePosition = active ? total : currentFrame?.elapsedMs || 0;
  const position = useVideo || playing || !follow ? elapsedMs : livePosition;

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
    if (active && ms >= total) playback.followLive();
    else playback.seek(ms);
  }

  function toggle() {
    if (useVideo && videoElement.current) playback.toggleVideo();
    else playback.togglePlayback(position, total);
  }

  return (
    <section aria-label={t('browserView')} className={studioStyles.studioPanel}>
      <div className={studioStyles.runReplayPanel}>
        <div data-ui="run-replay-surface" className={studioStyles.runReplaySurface}>
          {active && follow && <span className={styles.liveIndicator}>● LIVE</span>}
          {useVideo ? (
            <video
              ref={videoElement}
              key={video?.id}
              aria-label={t('runVideo')}
              src={video ? asset(id, video) : undefined}
              className={styles.video}
              playsInline
              preload="auto"
              onLoadedMetadata={(event) => {
                playback.seek(elapsedMs);
                event.currentTarget.currentTime = elapsedMs / 1000;
                event.currentTarget.playbackRate = speed;
                const duration = event.currentTarget.duration;

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
              alt={t('liveView')}
              width={1280}
              height={800}
              unoptimized
              onError={clearPreview}
              className={styles.video}
            />
          ) : currentFrame ? (
            <Image
              src={artifactUrl(currentFrame)}
              alt={t('frameView', { url: currentFrame.pageUrl || currentFrame.surface?.id || '' })}
              width={1280}
              height={800}
              unoptimized
              className={styles.video}
            />
          ) : (
            <p className={styles.description}>
              {active ? t('environmentPreparing') : t('noFrames')}
            </p>
          )}
        </div>
        <div
          data-ui="run-replay-controls"
          className={clsx(studioStyles.studioPanelToolbar, studioStyles.runReplayControls)}
        >
          <Button
            variant="primary"
            size="icon"
            disabled={!useVideo && frames.length < 2}
            aria-label={playing ? t('pausePlayback') : t('playPlayback')}
            onClick={toggle}
          >
            <Icon icon={playing ? pauseIcon : resultsIcon} width="20" aria-hidden="true" />
          </Button>
          <span aria-label={t('playbackTime')} className={styles.playbackTime}>
            {time(position)} / {time(total)}
          </span>
          <div className={styles.container}>
            <Slider.Root
              className={styles.root}
              min={0}
              max={Math.max(1, total)}
              step={1}
              value={Math.min(total, position)}
              disabled={!total}
              onValueChange={seek}
              onValueCommitted={seek}
            >
              <Slider.Control data-testid="replay-timeline" className={styles.control}>
                <Slider.Track className={styles.track}>
                  <Slider.Indicator className={styles.indicator} />
                  {marks.map(({ step, percent }) => (
                    <span
                      key={step.id}
                      aria-hidden="true"
                      className={styles.issueMarker}
                      style={{ left: `${percent}%` }}
                    />
                  ))}
                  <Slider.Thumb aria-label={t('timeline')} className={styles.thumb} />
                </Slider.Track>
              </Slider.Control>
            </Slider.Root>
            <div className={styles.actionMarkers} aria-label={t('actionMarkers')}>
              {marks.map(({ step, elapsed, percent }) => (
                <Button
                  variant="ghost"
                  key={step.id}
                  aria-label={t('jumpAction', { title: step.title })}
                  title={`${time(elapsed)} · ${step.title}`}
                  onClick={() => seek(elapsed)}
                  className={clsx(
                    styles.action,
                    step.status === 'failed' ? styles.error : styles.normalMarker,
                  )}
                  style={{ left: `${percent}%` }}
                >
                  <Icon icon={actionIcon(step)} aria-hidden="true" width="12" height="12" />
                </Button>
              ))}
            </div>
          </div>
          <Select
            aria-label={t('playbackSpeed')}
            value={speed}
            onValueChange={(value) => playback.setSpeed(Number(value))}
            className={styles.speedSelect}
            items={[
              { value: 0.5, label: '0.5×' },
              { value: 1, label: '1×' },
              { value: 2, label: '2×' },
            ]}
          />
          {useVideo && videos.length > 1 && (
            <Select
              aria-label={t('videoPage')}
              value={video?.id || ''}
              onValueChange={(value) => {
                setVideoDuration(0);
                playback.setVideoId(value);
              }}
              className={styles.videoSelector}
              items={videos.map((item) => ({ value: item.id, label: item.pageId }))}
            />
          )}
          {(video || trace) && (
            <div className={styles.downloadActions}>
              {video && (
                <Tooltip content={t('downloadVideo')}>
                  <a
                    href={`${asset(id, video)}?download`}
                    className={buttonStyles({ variant: 'ghost', size: 'icon-sm' })}
                    aria-label={t('downloadVideo')}
                  >
                    <Icon icon={videoIcon} width="16" aria-hidden="true" />
                  </a>
                </Tooltip>
              )}
              {trace && (
                <Tooltip content={t('downloadTrace')}>
                  <a
                    href={`${asset(id, trace)}?download`}
                    className={buttonStyles({ variant: 'ghost', size: 'icon-sm' })}
                    aria-label={t('downloadTrace')}
                  >
                    <Icon icon={archiveIcon} width="16" aria-hidden="true" />
                  </a>
                </Tooltip>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
