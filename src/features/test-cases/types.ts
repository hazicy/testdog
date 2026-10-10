import type { Plan } from '@/automation/compiler/schema';
import type { TestTarget } from '@/automation/platform/target';

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
