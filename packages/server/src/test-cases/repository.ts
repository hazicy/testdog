import { assertLoginIdentityReference } from '@testdog/server/login-identities/repository';
import { loginIdentities } from '@testdog/server/db/schema';
import { ownedBy, type UserScope } from '@testdog/server/shared/ownership';
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

export async function saveTest(raw: unknown, id?: string, userId: UserScope = null) {
  const parsed = testSchema.safeParse(raw);

  if (!parsed.success) throw new WorkspaceError(testValidationMessage(parsed.error));
  const { url, ...values } = parsed.data;
  const input = {
    ...values,
    target: parsed.data.target ?? defaultWebTarget(url),
  };

  return db.transaction(async (tx) => {
    await assertLoginIdentityReference(input.target, userId, tx);
    if (id) {
      const [identity] = await tx
        .select()
        .from(loginIdentities)
        .where(and(eq(loginIdentities.loginTestId, id), ownedBy(loginIdentities.userId, userId)))
        .limit(1);

      if (
        identity &&
        (!input.plan ||
          input.target?.platform !== 'web' ||
          input.target.loginIdentityId ||
          new URL(input.target.url).origin !== new URL(identity.website).origin)
      )
        throw new WorkspaceError(
          '该用例被登录身份用作前置流程，不能改为原生平台、引用登录身份或切换网站。',
        );
    }

    const [test] = id
      ? await tx
          .update(testCases)
          .set({ ...input, updatedAt: new Date().toISOString() })
          .where(and(eq(testCases.id, id), ownedBy(testCases.userId, userId)))
          .returning()
      : await tx
          .insert(testCases)
          .values({ ...input, userId })
          .returning();

    if (!test) throw new WorkspaceError('用例不存在。', 404);

    return { ...test, url: targetUrl(test.target) };
  });
}

export async function deleteTest(id: string, userId: UserScope = null) {
  const [identity] = await db
    .select({ id: loginIdentities.id })
    .from(loginIdentities)
    .where(and(eq(loginIdentities.loginTestId, id), ownedBy(loginIdentities.userId, userId)))
    .limit(1);

  if (identity)
    throw new WorkspaceError('该用例被登录身份引用，请先更换登录流程或删除登录身份。', 409);
  const rows = await db
    .delete(testCases)
    .where(and(eq(testCases.id, id), ownedBy(testCases.userId, userId)))
    .returning({ id: testCases.id });

  if (!rows.length) throw new WorkspaceError('用例不存在。', 404);
}
