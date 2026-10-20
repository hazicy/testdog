import { api } from '@/client/api';
import {
  CompileRequestSchema,
  type CompileRequest,
} from '@testdog/contracts/execution/compilation';
import { ExecutablePlanSchema, type Plan } from '@testdog/contracts/execution/plan';

export async function compilePlan(input: CompileRequest, signal?: AbortSignal): Promise<Plan> {
  const { plan } = await api
    .post('/api/tests/compile', {
      json: CompileRequestSchema.parse(input),
      signal,
      timeout: 100000,
      totalTimeout: 100000,
    })
    .json<{ plan: Plan }>();

  signal?.throwIfAborted();

  return ExecutablePlanSchema.parse(plan);
}
