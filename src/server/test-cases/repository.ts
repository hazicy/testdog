import { ownedBy, type UserScope } from '@/server/shared/ownership';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { testCases } from '@/db/schema';
import { defaultWebTarget, legacyWebTarget, targetUrl } from '@/automation/platform/target';
import type { TestCase } from '@/features/test-cases/types';
import { testSchema, testValidationMessage } from '@/features/test-cases/schemas';
import { WorkspaceError } from '@/server/shared/errors';

export const listTests = async (userId: UserScope = null) =>
  (
    await db
      .select()
      .from(testCases)
      .where(ownedBy(testCases.userId, userId))
      .orderBy(desc(testCases.updatedAt), desc(testCases.id))
      .limit(50)
  ).map((test) => ({
    ...test,
    url: test.target ? targetUrl(test.target) : test.url,
    target: test.target ?? legacyWebTarget(test.url),
  }));

export async function saveTest(
  input: Pick<TestCase, 'name' | 'url' | 'goal' | 'tags' | 'target' | 'plan'>,
  id?: string,
  userId: UserScope = null,
) {
  const parsed = testSchema.safeParse(input);

  if (!parsed.success) throw new WorkspaceError(testValidationMessage(parsed.error));
  input = {
    ...parsed.data,
    target: parsed.data.target ?? defaultWebTarget(parsed.data.url),
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

  return test;
}

export async function deleteTest(id: string, userId: UserScope = null) {
  const rows = await db
    .delete(testCases)
    .where(and(eq(testCases.id, id), ownedBy(testCases.userId, userId)))
    .returning({ id: testCases.id });

  if (!rows.length) throw new WorkspaceError('用例不存在。', 404);
}
