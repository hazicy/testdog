import { expect, it } from 'vitest';
import { initialStudioState, runStudioReducer } from './runStudio';

it('selects board evidence in one transition without first revealing the steps panel', () => {
  const state = runStudioReducer(
    { ...initialStudioState, playing: true, view: 'plan' },
    {
      type: 'inspect',
      source: 'plan',
      stepId: 'step',
      issueId: 'occurrence',
      cursor: { kind: 'evidence', stepId: 'step', index: 2 },
      elapsedMs: 2400,
    },
  );

  expect(state).toMatchObject({
    view: 'execution',
    playing: false,
    inspectedStepId: 'step',
    selectedIssueId: 'occurrence',
    elapsedMs: 2400,
    revealPanels: ['execution', 'plan'],
    cursor: { kind: 'evidence', stepId: 'step', index: 2 },
  });
});

it('replaces a stale inspected step when an issue has no step and seeks its occurrence', () => {
  const state = runStudioReducer(
    { ...initialStudioState, inspectedStepId: 'old-step', playing: true },
    {
      type: 'inspect',
      source: 'issues',
      issueId: 'run-issue',
      cursor: { kind: 'timeline' },
      elapsedMs: 12000,
    },
  );

  expect(state.inspectedStepId).toBeUndefined();
  expect(state.selectedIssueId).toBe('run-issue');
  expect(state.cursor).toEqual({ kind: 'timeline' });
  expect(state.revealPanels).toEqual(['execution', 'issues']);
  expect(state.playing).toBe(false);
});

it('keeps a manually inspected step while seeking, then releases inspection when following live', () => {
  const inspected = { ...initialStudioState, inspectedStepId: 'step', selectedIssueId: 'issue' };
  const sought = runStudioReducer(inspected, { type: 'seek', elapsedMs: 3000 });

  expect(sought.inspectedStepId).toBe('step');
  expect(sought.cursor).toEqual({ kind: 'timeline' });
  const live = runStudioReducer(sought, { type: 'follow' });

  expect(live.cursor).toEqual({ kind: 'live' });
  expect(live.inspectedStepId).toBeUndefined();
  expect(live.selectedIssueId).toBeUndefined();
});

it('pauses playback when switching the main view but leaves it running when opening logs', () => {
  const playing = { ...initialStudioState, playing: true };

  expect(runStudioReducer(playing, { type: 'panel', panel: 'console' })).toMatchObject({
    playing: true,
    logTab: 'console',
    view: 'execution',
  });
  expect(runStudioReducer(playing, { type: 'panel', panel: 'recording' })).toMatchObject({
    playing: false,
    view: 'recording',
  });
});

it('activates playback from another visible panel and ignores redundant dock activation', () => {
  const replaying = runStudioReducer(
    { ...initialStudioState, view: 'plan' },
    {
      type: 'toggle',
      position: 2000,
      duration: 5000,
    },
  );

  expect(replaying).toMatchObject({ view: 'execution', playing: true, elapsedMs: 2000 });
  expect(runStudioReducer(replaying, { type: 'panel', panel: 'execution' })).toBe(replaying);
  expect(runStudioReducer({ ...initialStudioState, view: 'plan' }, { type: 'follow' }).view).toBe(
    'execution',
  );
});

it('resets layout activation and pauses playback without losing the inspection or issue draft', () => {
  const state = runStudioReducer(
    {
      ...initialStudioState,
      playing: true,
      logTab: 'network',
      revealPanels: ['execution', 'issues'],
      inspectedStepId: 'step',
      issueStepId: 'draft',
    },
    { type: 'layout', layout: 'focus' },
  );

  expect(state).toMatchObject({
    layout: 'focus',
    layoutVersion: 1,
    view: 'execution',
    logTab: 'logs',
    revealPanels: [],
    playing: false,
    inspectedStepId: 'step',
    issueStepId: 'draft',
  });
});
