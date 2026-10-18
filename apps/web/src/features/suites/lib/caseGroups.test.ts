import { describe, expect, it } from 'vitest';
import type { SuiteTreeNode } from '@testdog/contracts/suites/types';
import type { TestCase } from '@testdog/contracts/test-cases/types';
import { caseGroups } from './caseGroups';

const folder = (id: string, parentId: string | null, testCount: number): SuiteTreeNode => ({
  id,
  parentId,
  name: id,
  testCount,
  totalTestCount: testCount,
  position: 0,
  version: 1,
  updatedAt: '',
  tests: [],
});
const testCase = (id: string, folderId: string | null) => ({ id, folderId }) as TestCase;

describe('caseGroups', () => {
  const folders = [
    folder('parent', null, 1),
    folder('child', 'parent', 1),
    folder('empty', null, 0),
  ];

  it('groups direct members without duplicating nested cases', () => {
    const groups = caseGroups(
      folders,
      [testCase('a', 'parent'), testCase('b', 'child'), testCase('root', null)],
      true,
    );

    expect(groups.map((group) => [group.folder.id, group.tests.map((test) => test.id)])).toEqual([
      ['parent', ['a']],
      ['child', ['b']],
      ['empty', []],
    ]);
    expect(groups[1].name).toContain('parent');
    expect(groups[1].name).toContain('child');
  });

  it('does not mislabel nonempty folders omitted by pagination or filters as empty', () => {
    expect(caseGroups(folders, [], true).map((group) => group.folder.id)).toEqual(['empty']);
    expect(caseGroups(folders, [], false)).toEqual([]);
  });

  it('honors folder links and falls back to tree membership for older case data', () => {
    const tree = [{ ...folders[0], tests: [{ id: 'a', name: 'A' }] }, ...folders.slice(1)];
    const groups = caseGroups(
      tree,
      [{ id: 'a' } as TestCase, testCase('b', 'child')],
      true,
      'parent',
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].tests.map((test) => test.id)).toEqual(['a']);
  });
});
