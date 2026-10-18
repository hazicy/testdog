'use client';

import { createContext, type ReactNode } from 'react';
import type { FolderTree, SuiteTreeNode } from '@testdog/contracts/suites/types';

export const FolderTreeContext = createContext<FolderTree | undefined>(undefined);

export const FolderActionsContext = createContext<{
  createFolder: () => void;
  moveCases: (testIds: string[], onMoved?: () => void) => void;
  renderAddActions: (folder: SuiteTreeNode) => ReactNode;
  renderActions: (folder: SuiteTreeNode) => ReactNode;
} | null>(null);
