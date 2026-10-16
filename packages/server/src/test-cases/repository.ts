import { assertUserScope, ownedBy, type UserScope } from '@testdog/server/shared/ownership';
import { and, eq } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import { testCases } from '@testdog/server/db/schema';
import { defaultWebTarget, targetUrl } from '@testdog/contracts/automation/platform/target';
import { testSchema, testValidationMessage } from '@testdog/contracts/test-cases/schemas';
import { WorkspaceError } from '@testdog/server/shared/errors';

export async function getTest(id: string, userId: UserScope) {
  const [test] = await db
    .select()
    .from(testCases)
    .where(and(eq(testCases.id, id), ownedBy(testCases.userId, userId)));

  if (!test) throw new WorkspaceError('用例不存在。', 404);

  return { ...test, url: targetUrl(test.target) };
}

export async function saveTest(raw: unknown, id: string | undefined, userId: UserScope) {
  assertUserScope(userId);
  const parsed = testSchema.safeParse(raw);

  if (!parsed.success) throw new WorkspaceError(testValidationMessage(parsed.error));
  const { url, ...values } = parsed.data;
  const input = {
    ...values,
    target: parsed.data.target ?? defaultWebTarget(url),
  };

  const [test] = id
    ? await db
        .update(testCases)
        .set({ ...input, updatedAt: new Date().toISOString() })
        .where(and(eq(testCases.id, id), ownedBy(testCases.userId, userId)))
        .returning()
    : await db
        .insert(testCases)
        .values({ ...input, userId })
        .returning();

  if (!test) throw new WorkspaceError('用例不存在。', 404);

  return { ...test, url: targetUrl(test.target) };
}

export async function deleteTest(id: string, userId: UserScope) {
  const rows = await db
    .delete(testCases)
    .where(and(eq(testCases.id, id), ownedBy(testCases.userId, userId)))
    .returning({ id: testCases.id });

  if (!rows.length) throw new WorkspaceError('用例不存在。', 404);
}
