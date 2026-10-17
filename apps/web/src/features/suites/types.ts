import type { SuiteTreeNode } from '@testdog/contracts/suites/types';

export type DirectoryItem =
  | { kind: 'folder'; value: SuiteTreeNode }
  | { kind: 'case'; value: { id: string; name: string }; parentId: string | null };
export type DirectoryEdit =
  { kind: 'create'; parentId: string | null } | { kind: 'rename'; item: DirectoryItem };

export type DirectoryAction =
  | DirectoryEdit
  | { kind: 'move'; item: DirectoryItem; destination: string | null }
  | { kind: 'delete'; item: DirectoryItem };
