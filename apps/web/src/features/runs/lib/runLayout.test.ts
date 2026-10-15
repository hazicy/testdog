import { expect, it } from 'vitest';
import { runWorkspaceTabs, type RunLayout } from './runLayout';

it.each<RunLayout>(['default', 'review', 'notes', 'debug', 'focus'])(
  '%s creates every panel after the panel it references',
  (layout) => {
    const tabs = runWorkspaceTabs(layout, 3);
    const created = new Set<string>();

    for (const tab of tabs) {
      if (tab.reference) expect(created.has(tab.reference)).toBe(true);
      expect(created.has(tab.id)).toBe(false);
      created.add(tab.id);
    }

    expect(tabs).toHaveLength(8);
    expect(tabs.find((tab) => tab.id === 'issues')?.badge).toBe(3);
  },
);

it('keeps subsequent layouts independent of an earlier dock instance', () => {
  const modified = runWorkspaceTabs('default', 10);

  modified[0].label = 'changed';
  expect(runWorkspaceTabs('default', 0)[0].label).toBe('步骤');
  expect(
    runWorkspaceTabs('focus', 0)
      .filter((tab) => tab.initiallyVisible)
      .map((tab) => tab.id),
  ).toEqual(['execution']);
  expect(
    runWorkspaceTabs('default', 0).find((tab) => tab.id === 'console')?.initiallyCollapsed,
  ).toBe(true);
});
