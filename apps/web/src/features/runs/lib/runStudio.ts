import type { RunLayout } from '@/features/runs/components/RunLayoutPopover';

export type PanelId =
  'steps' | 'issues' | 'plan' | 'execution' | 'recording' | 'logs' | 'console' | 'network';
type View = Extract<PanelId, 'plan' | 'execution' | 'recording'>;
export type EvidenceSource = Extract<PanelId, 'steps' | 'issues' | 'plan'>;
type Cursor =
  { kind: 'live' } | { kind: 'timeline' } | { kind: 'evidence'; index?: number; stepId?: string };
export type StudioState = {
  cursor: Cursor;
  playing: boolean;
  speed: number;
  elapsedMs: number;
  videoId: string;
  inspectedStepId?: string;
  selectedIssueId?: string;
  issueStepId?: string;
  view: View;
  logTab: 'logs' | 'console' | 'network';
  revealPanels: readonly PanelId[];
  layout: RunLayout;
  layoutVersion: number;
};
export const initialStudioState: StudioState = {
  cursor: { kind: 'live' },
  playing: false,
  speed: 1,
  elapsedMs: 0,
  videoId: '',
  view: 'execution',
  logTab: 'logs',
  revealPanels: [],
  layout: 'default',
  layoutVersion: 0,
};
export type StudioAction =
  | {
      type: 'inspect';
      source: EvidenceSource;
      stepId?: string;
      issueId?: string;
      cursor: Exclude<Cursor, { kind: 'live' }>;
      elapsedMs: number;
    }
  | { type: 'seek'; elapsedMs: number }
  | { type: 'follow' }
  | { type: 'toggle'; position: number; duration: number }
  | { type: 'playing'; value: boolean }
  | { type: 'elapsed'; value: number | ((previous: number) => number) }
  | { type: 'speed'; value: number }
  | { type: 'video'; id: string }
  | { type: 'panel'; panel: PanelId }
  | { type: 'logs' }
  | { type: 'layout'; layout: RunLayout }
  | { type: 'issue'; stepId?: string };

/** Each user intent updates its playback, inspection and panel state together. */
export function runStudioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case 'inspect':
      return {
        ...state,
        cursor: action.cursor,
        elapsedMs: action.elapsedMs,
        playing: false,
        inspectedStepId: action.stepId,
        selectedIssueId: action.issueId,
        view: 'execution',
        revealPanels: ['execution', action.source],
      };
    case 'seek':
      // A manually opened step stays available while browsing its timeline.
      return {
        ...state,
        cursor: { kind: 'timeline' },
        elapsedMs: action.elapsedMs,
        playing: false,
        view: 'execution',
      };
    case 'follow':
      return {
        ...state,
        cursor: { kind: 'live' },
        playing: false,
        inspectedStepId: undefined,
        selectedIssueId: undefined,
        view: 'execution',
      };
    case 'toggle':
      return {
        ...state,
        cursor: { kind: 'timeline' },
        elapsedMs: action.position >= action.duration ? 0 : action.position,
        playing: !state.playing,
        view: 'execution',
      };
    case 'playing':
      return { ...state, playing: action.value };
    case 'elapsed':
      return {
        ...state,
        elapsedMs:
          typeof action.value === 'function' ? action.value(state.elapsedMs) : action.value,
      };
    case 'speed':
      return { ...state, speed: action.value };
    case 'video':
      return { ...state, videoId: action.id, elapsedMs: 0, playing: false };
    case 'panel':
      if (action.panel === 'steps' || action.panel === 'issues') return state;
      if (action.panel === 'logs' || action.panel === 'console' || action.panel === 'network')
        return { ...state, logTab: action.panel };
      if (action.panel === state.view) return state;

      return { ...state, view: action.panel, playing: false };
    case 'logs':
      return { ...state, logTab: 'logs', revealPanels: ['logs'] };
    case 'layout':
      return {
        ...state,
        layout: action.layout,
        layoutVersion: state.layoutVersion + 1,
        view: 'execution',
        logTab: 'logs',
        revealPanels: [],
        playing: false,
      };
    case 'issue':
      return { ...state, issueStepId: action.stepId };
  }
}
