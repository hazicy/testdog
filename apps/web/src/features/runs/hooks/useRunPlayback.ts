'use client';

import { useCallback, useRef, useState } from 'react';

type Cursor =
  { kind: 'live' } | { kind: 'timeline' } | { kind: 'evidence'; index?: number; stepId?: string };

export function useRunPlayback() {
  const [cursor, setCursor] = useState<Cursor>({ kind: 'live' });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [videoId, setVideoId] = useState('');
  const videoElement = useRef<HTMLVideoElement>(null);

  const selectStep = useCallback((stepId: string, elapsed: number, index?: number) => {
    setCursor({ kind: 'evidence', stepId, index });
    setElapsedMs(elapsed);
    setPlaying(false);
  }, []);

  const showFrame = useCallback((index: number, elapsed: number) => {
    setCursor({ kind: 'evidence', index });
    setElapsedMs(elapsed);
    setPlaying(false);
  }, []);

  const seek = useCallback((elapsed: number) => {
    const element = videoElement.current;

    if (element) {
      element.pause();
      element.currentTime = elapsed / 1000;
    }

    setCursor({ kind: 'timeline' });
    setElapsedMs(elapsed);
    setPlaying(false);
  }, []);

  const followLive = useCallback(() => {
    setCursor({ kind: 'live' });
    setPlaying(false);
  }, []);

  function togglePlayback(position: number, duration: number) {
    setCursor({ kind: 'timeline' });
    setElapsedMs(position >= duration ? 0 : position);
    setPlaying((value) => !value);
  }

  return {
    toggleVideo: () => {
      const element = videoElement.current;

      if (!element) return;
      if (!element.paused) element.pause();
      else {
        if (element.ended) element.currentTime = 0;
        void element.play().catch(() => setPlaying(false));
      }
    },
    elapsedMs,
    setElapsedMs,
    follow: cursor.kind === 'live',
    evidenceIndex: cursor.kind === 'evidence' ? cursor.index : undefined,
    inspectingEvidence: cursor.kind === 'evidence',
    stepId: cursor.kind === 'evidence' ? cursor.stepId : undefined,
    playing,
    speed,
    videoId,
    videoElement,
    selectStep,
    showFrame,
    seek,
    followLive,
    togglePlayback,
    setPlaying,
    setSpeed: (rate: number) => {
      setSpeed(rate);
      const element = videoElement.current;

      if (element) element.playbackRate = rate;
    },
    setVideoId,
  };
}
