import { useLocale, useMessages } from 'next-intl';
import * as authoring from '@/features/test-cases/lib/authoring';
import type { Plan } from '@testdog/contracts/execution/plan';

export function useAuthoring() {
  const locale = useLocale();
  const labels = useMessages().authoring;

  return {
    caseName: (text: string) => authoring.caseName(text, locale, labels),
    emptyPlan: (title: string) => authoring.emptyPlan(title, labels),
    editablePlan: (plan: Plan, title?: string) => authoring.editablePlan(plan, title, labels),
    planText: (plan: Plan) => authoring.planText(plan, labels),
  };
}
