import { api } from '@/client/api';
import type { Plan } from '@/automation/compiler/schema';

export async function compilePlan(goal: string, url?: string, currentPlan?: Plan): Promise<Plan> {
  const { plan } = await api
    .post('/api/tests/compile', {
      json: { goal, ...(url ? { url } : {}), ...(currentPlan ? { currentPlan } : {}) },
      timeout: 100000,
      totalTimeout: 100000,
    })
    .json<{ plan: Plan }>();

  return plan;
}
