import type { Plan } from '@/automation/compiler/schema';
import { PlanSchema } from '@/automation/compiler/schema';
import type { CaseSettingsValue } from './caseSettings';
import type { TestCase } from '../types';

export type CaseDraft = {
  test?: TestCase;
  duplicate?: boolean;
  name: string;
  url: string;
  goal: string;
  plan: Plan;
  settings?: CaseSettingsValue;
};
const key = (id: string) => `caseforge:case-draft:${id}`;

export function writeCaseDraft(id: string, draft: CaseDraft) {
  sessionStorage.setItem(key(id), JSON.stringify(draft));
}

export function readCaseDraft(id: string): CaseDraft | undefined {
  try {
    const raw = sessionStorage.getItem(key(id));
    const draft = raw ? JSON.parse(raw) : undefined;

    if (
      !draft ||
      typeof draft.name !== 'string' ||
      typeof draft.url !== 'string' ||
      typeof draft.goal !== 'string'
    )
      return;
    draft.plan = PlanSchema.parse(draft.plan);

    return draft;
  } catch {
    return;
  }
}

export function clearCaseDraft(id: string) {
  sessionStorage.removeItem(key(id));
}
