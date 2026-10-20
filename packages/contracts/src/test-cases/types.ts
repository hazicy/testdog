import type { Plan } from '@testdog/contracts/execution/plan';
import type { TestTarget } from '@testdog/contracts/execution/target';

export type TestCase = {
  id: string;
  folderId?: string | null;
  name: string;
  url: string;
  goal: string;
  plan?: Plan | null;
  target: TestTarget;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};
