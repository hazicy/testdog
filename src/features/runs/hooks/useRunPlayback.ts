'use client';
import { useCallback, useRef, useState } from 'react';

export function useRunPlayback() {
  const [follow, setFollow] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);
  const [stepId, setStepId] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<'frames' | 'video'>('frames');
  const [videoId, setVideoId] = useState('');
  const videoElement = useRef<HTMLVideoElement>(null);

  const selectStep = useCallback((id: string, index?: number) => {
    setStepId(id);
    setMode('frames');
    setFollow(false);
    setPlaying(false);
    if (index !== undefined) setFrameIndex(index);
  }, []);

  function showFrame(index: number) {
    setFollow(false);
    setPlaying(false);
    setMode('frames');
    setFrameIndex(index);
  }

  function seek(index: number) {
    setFollow(false);
    setPlaying(false);
    setStepId(undefined);
    setFrameIndex(index);
  }

  function followLive() {
    setFollow(true);
    setStepId(undefined);
    setPlaying(false);
    setMode('frames');
  }

  function togglePlayback(currentIndex: number, frameCount: number) {
    setFollow(false);
    setStepId(undefined);
    setFrameIndex(currentIndex >= frameCount - 1 ? 0 : currentIndex);
    setPlaying(!(playing && currentIndex < frameCount - 1));
  }

  function showVideo() {
    setPlaying(false);
    setMode('video');
  }

  return {
    follow,
    frameIndex,
    stepId,
    playing,
    speed,
    mode,
    videoId,
    videoElement,
    selectStep,
    showFrame,
    seek,
    followLive,
    togglePlayback,
    showVideo,
    setFrameIndex,
    setPlaying,
    setSpeed,
    setVideoId,
    showFrames: () => setMode('frames'),
  };
}
