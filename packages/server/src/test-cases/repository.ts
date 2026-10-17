import {
  ownershipValues,
  assertUserScope,
  ownedBy,
  type UserScope,
} from '@testdog/server/shared/ownership';
import { and, eq } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import { testCases } from '@testdog/server/db/schema';
import { defaultWebTarget, targetUrl } from '@testdog/contracts/automation/platform/target';
import {
  testNameSchema,
  testSchema,
  testValidationMessage,
} from '@testdog/contracts/test-cases/schemas';
import { caseFolderValues, lockTree } from '@testdog/server/suites/folders';
import { validId } from '@testdog/server/shared/http';
import { WorkspaceError } from '@testdog/server/shared/errors';

export async function getTest(id: string, userId: UserScope) {
  const [test] = await db
    .select()
    .from(testCases)
    .where(and(eq(testCases.id, id), ownedBy(testCases, userId)));

  if (!test) throw new WorkspaceError('用例不存在。', 404);

  return { ...test, url: targetUrl(test.target) };
}

export async function saveTest(raw: unknown, id: string | undefined, userId: UserScope) {
  assertUserScope(userId);
  const parsed = testSchema.safeParse(raw);

  if (!parsed.success) throw new WorkspaceError(testValidationMessage(parsed.error));
  const { url, folderId, ...values } = parsed.data;
  const input = {
    ...values,
    target: parsed.data.target ?? defaultWebTarget(url),
  };

  return db.transaction(async (tx) => {
    if (folderId !== undefined) await lockTree(tx, userId);
    const location = folderId === undefined ? {} : await caseFolderValues(tx, folderId, userId);
    const [test] = id
      ? await tx
          .update(testCases)
          .set({ ...input, ...location, updatedAt: new Date().toISOString() })
          .where(and(eq(testCases.id, id), ownedBy(testCases, userId)))
          .returning()
      : await tx
          .insert(testCases)
          .values({ ...input, ...location, ...ownershipValues(userId) })
          .returning();

    if (!test) throw new WorkspaceError('用例不存在。', 404);

    return { ...test, url: targetUrl(test.target) };
  });
}

export async function deleteTest(id: string, userId: UserScope) {
  const rows = await db
    .delete(testCases)
    .where(and(eq(testCases.id, id), ownedBy(testCases, userId)))
    .returning({ id: testCases.id });

  if (!rows.length) throw new WorkspaceError('用例不存在。', 404);
}

export async function renameTest(id: string, name: unknown, scope: UserScope) {
  validId(id);
  const parsed = testNameSchema.safeParse(name);

  if (!parsed.success) throw new WorkspaceError('用例名称无效。');
  const [test] = await db
    .update(testCases)
    .set({ name: parsed.data, updatedAt: new Date().toISOString() })
    .where(and(eq(testCases.id, id), ownedBy(testCases, scope)))
    .returning();

  if (!test) throw new WorkspaceError('用例不存在。', 404);

  return { ...test, url: targetUrl(test.target) };
}
