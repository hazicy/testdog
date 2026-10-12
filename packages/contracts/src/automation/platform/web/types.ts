import type { Step } from '@testdog/contracts/automation/compiler/schema';

export type RecordedAction = Step & { sensitive?: boolean };
