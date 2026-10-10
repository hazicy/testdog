import type { Step } from '../../compiler/schema';

export type RecordedAction = Step & { sensitive?: boolean };
