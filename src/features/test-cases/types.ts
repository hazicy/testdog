import type { TestTarget } from '@/automation/platform/target';

export type TestCase = {
  id: string;
  name: string;
  url: string;
  goal: string;
  target?: TestTarget;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};
