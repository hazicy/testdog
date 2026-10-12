'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  initialStudioState,
  runStudioReducer,
  type StudioAction,
} from '@/features/runs/lib/runStudio';

export function useRunStudio() {
  const [state, dispatch] = useReducer(runStudioReducer, initialStudioState);
  const videoElement = useRef<HTMLVideoElement>(null);
  const act = useCallback((action: StudioAction) => {
    if (
      action.type === 'seek' ||
      (action.type === 'inspect' && action.cursor.kind === 'timeline')
    ) {
      const element = videoElement.current;

      if (element) {
        element.pause();
        element.currentTime = action.elapsedMs / 1000;
      }
    }

    dispatch(action);
  }, []);

  useEffect(() => {
    if (!state.playing || state.view !== 'execution') videoElement.current?.pause();
  }, [state.playing, state.view]);
  const setPlaying = useCallback((value: boolean) => act({ type: 'playing', value }), [act]);
  const setElapsedMs = useCallback(
    (value: number | ((previous: number) => number)) => act({ type: 'elapsed', value }),
    [act],
  );
  const playback = {
    ...state,
    videoElement,
    follow: state.cursor.kind === 'live',
    evidenceIndex: state.cursor.kind === 'evidence' ? state.cursor.index : undefined,
    inspectingEvidence: state.cursor.kind === 'evidence',
    stepId: state.cursor.kind === 'evidence' ? state.cursor.stepId : undefined,
    setPlaying,
    setElapsedMs,
    seek: (elapsedMs: number) => act({ type: 'seek', elapsedMs }),
    followLive: () => act({ type: 'follow' }),
    togglePlayback: (position: number, duration: number) =>
      act({ type: 'toggle', position, duration }),
    toggleVideo: () => {
      const element = videoElement.current;

      if (!element) return;
      act({ type: 'panel', panel: 'execution' });
      if (!element.paused) element.pause();
      else {
        if (element.ended) element.currentTime = 0;
        void element.play().catch(() => setPlaying(false));
      }
    },
    setSpeed: (value: number) => {
      if (videoElement.current) videoElement.current.playbackRate = value;
      act({ type: 'speed', value });
    },
    setVideoId: (id: string) => act({ type: 'video', id }),
  };

  return { state, act, playback };
}
