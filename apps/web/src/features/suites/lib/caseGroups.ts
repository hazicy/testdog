import type { SuiteTreeNode } from '@testdog/contracts/suites/types';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import { suiteFolderPath } from '@testdog/contracts/suites/tree';

export function caseGroups(
  folders: SuiteTreeNode[],
  tests: TestCase[],
  includeEmpty: boolean,
  folderId?: string | null,
) {
  const locations = new Map(
    folders.flatMap((folder) => folder.tests.map((test) => [test.id, folder.id] as const)),
  );
  const byFolder = new Map<string | null, TestCase[]>();

  for (const test of tests) {
    const id = test.folderId ?? locations.get(test.id) ?? null;
    const items = byFolder.get(id) ?? [];

    items.push(test);
    byFolder.set(id, items);
  }

  return folders
    .filter((folder) => !folderId || folder.id === folderId)
    .map((folder) => ({
      folder,
      name: suiteFolderPath(folders, folder.id),
      tests: byFolder.get(folder.id) ?? [],
    }))
    .filter((group) => group.tests.length || (includeEmpty && group.folder.testCount === 0));
}
