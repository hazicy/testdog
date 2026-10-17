'use client';

import { createContext } from 'react';
import type { FolderTree } from '@testdog/contracts/suites/types';

export const FolderTreeContext = createContext<FolderTree | undefined>(undefined);
