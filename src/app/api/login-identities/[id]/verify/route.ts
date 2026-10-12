import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/shared/auth';
import { apiError, validId } from '@/server/shared/http';
import { submitOnce } from '@/server/shared/idempotency';
import { identityFor } from '@/server/login-identities/repository';
import { loginIdentities, testRuns } from '@/db/schema';
import { createRun } from '@/server/runs/repository';
import { ownedBy } from '@/server/shared/ownership';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId(request);
    const { id } = await context.params;

    validId(id);
    const result = await submitOnce(
      request,
      { id },
      async (tx) => {
        await tx
          .select()
          .from(loginIdentities)
          .where(and(eq(loginIdentities.id, id), ownedBy(loginIdentities.userId, userId)))
          .for('update');
        const identity = await identityFor(id, userId, tx);
        const [active] = identity.verificationRunId
          ? await tx
              .select({ id: testRuns.id })
              .from(testRuns)
              .where(
                and(
                  eq(testRuns.id, identity.verificationRunId),
                  ownedBy(testRuns.userId, userId),
                  inArray(testRuns.status, ['queued', 'preparing', 'running', 'finalizing']),
                ),
              )
          : [];

        if (active) return { runId: active.id };
        const run = await createRun({ loginIdentityId: id }, tx, userId);

        await tx
          .update(loginIdentities)
          .set({ verificationRunId: run.id, lastError: null })
          .where(eq(loginIdentities.id, id));

        return { runId: run.id };
      },
      userId,
    );

    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
