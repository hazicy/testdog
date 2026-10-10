'use client';
import Image from 'next/image';
import type { useRunPlayback } from '../hooks/useRunPlayback';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { WorkspaceIcon as Icon } from '@/components/shared/WorkspaceIcon';
import { isActiveRun, type TestRun, type RunArtifact } from '@/workspace/types';
import { asset, time } from '../presentation';

type Props = {
  id: string;
  run?: TestRun;
  currentFrame?: RunArtifact;
  currentIndex: number;
  frames: RunArtifact[];
  videos: RunArtifact[];
  video?: RunArtifact;
  previewUrl?: string;
  clearPreview: () => void;
  playback: ReturnType<typeof useRunPlayback>;
};

export function RunPlayer({
  id,
  run,
  currentFrame,
  currentIndex,
  frames,
  videos,
  video,
  previewUrl,
  clearPreview,
  playback,
}: Props) {
  const { follow, playing, speed, mode, videoElement } = playback;

  return (
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
        {(previewUrl || currentFrame) && (
          <a
            href={previewUrl || (currentFrame ? asset(id, currentFrame) : undefined)}
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
        ) : previewUrl ? (
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
            onClick={playback.showFrames}
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
            onClick={playback.showVideo}
          >
            完整录像
          </Button>
          {mode === 'video' && videos.length > 1 && (
            <Select
              aria-label="录像页面"
              value={video?.id || ''}
              onValueChange={playback.setVideoId}
              className="ws-input w-auto"
              items={[videos.map((item) => ({ value: item.id, label: <>{item.pageId}</> }))]}
            />
          )}
          {run && isActiveRun(run.status) && (
            <Button
              className={`ws-button ml-auto ${follow ? 'selected' : ''}`}
              onClick={playback.followLive}
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
              aria-label={playing && currentIndex < frames.length - 1 ? '暂停回看' : '播放回看'}
              onClick={() => playback.togglePlayback(currentIndex, frames.length)}
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
              onChange={(event) => playback.seek(Number(event.target.value))}
              className="min-w-0 flex-1 accent-brand"
            />
            <span className="font-mono text-xs text-page-muted">
              {time(frames.at(-1)?.elapsedMs || 0)}
            </span>
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
          </div>
        )}
      </div>
    </section>
  );
}
