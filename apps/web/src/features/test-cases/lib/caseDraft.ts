import type { Plan } from '@testdog/contracts/automation/compiler/schema';
import { PlanSchema } from '@testdog/contracts/automation/compiler/schema';
import type { CaseSettingsValue } from '@/features/test-cases/lib/caseSettings';
import type { TestCase } from '@testdog/contracts/test-cases/types';

export type CaseDraft = {
  folderId?: string | null;
  test?: TestCase;
  duplicate?: boolean;
  name: string;
  goal: string;
  plan: Plan;
  settings?: CaseSettingsValue;
};
const key = (id: string) => `testdog:case-draft:${id}`;

export function writeCaseDraft(id: string, draft: CaseDraft) {
  sessionStorage.setItem(key(id), JSON.stringify(draft));
}

export function readCaseDraft(id: string): CaseDraft | undefined {
  try {
    const raw = sessionStorage.getItem(key(id));
    const draft = raw ? JSON.parse(raw) : undefined;

    if (!draft || typeof draft.name !== 'string' || typeof draft.goal !== 'string') return;
    draft.plan = PlanSchema.parse(draft.plan);

    return draft;
  } catch {
    return;
  }
}

export function clearCaseDraft(id: string) {
  sessionStorage.removeItem(key(id));
}
