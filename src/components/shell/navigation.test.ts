import { expect, test } from 'vitest';
import { activeWorkspaceNavigation, workspaceNavigation } from './navigation';

test('matches each workspace section and its descendants at path boundaries', () => {
  for (const item of workspaceNavigation) {
    expect(activeWorkspaceNavigation(item.href)).toBe(item);
    expect(activeWorkspaceNavigation(`${item.href}/detail`)).toBe(item);
    expect(activeWorkspaceNavigation(`${item.href}-other`)).toBeUndefined();
  }

  expect(activeWorkspaceNavigation('/cases/editor/draft')).toBe(workspaceNavigation[0]);
  expect(activeWorkspaceNavigation('/missing')).toBeUndefined();
});
