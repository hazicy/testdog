import type { Plan } from '@testdog/contracts/automation/compiler/schema';
import type { TestTarget } from '@testdog/contracts/automation/platform/target';

export type TestCase = {
  id: string;
  name: string;
  url: string;
  goal: string;
  plan?: Plan | null;
  target?: TestTarget;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};
