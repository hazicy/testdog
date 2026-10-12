import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { validateInputReferences } from '@/automation/compiler/executionPlan';
import { db } from '@/db';
import { loginIdentities, loginStateCaches, testCases, testRuns } from '@/db/schema';
import { ownedBy, type UserScope } from '@/server/shared/ownership';
import { WorkspaceError } from '@/server/shared/errors';
import { ExecutablePlanSchema } from '@/automation/compiler/schema';
import { WebTargetSchema, type TestTarget } from '@/automation/platform/target';
import { loginIdentityInput } from '@/features/login-identities/schemas';
import type { LoginIdentity } from '@/features/login-identities/types';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function identityFor(
  id: string,
  userId: UserScope,
  tx: Tx | typeof db = db,
  lock = false,
) {
  const query = tx
    .select()
    .from(loginIdentities)
    .where(and(eq(loginIdentities.id, id), ownedBy(loginIdentities.userId, userId)));
  const [identity] = await (lock ? query.for('share') : query);

  if (!identity) throw new WorkspaceError('登录身份不存在。', 404);

  return identity;
}

export async function loginFlow(
  identity: typeof loginIdentities.$inferSelect,
  tx: Tx | typeof db = db,
) {
  const [flow] = await tx
    .select()
    .from(testCases)
    .where(and(eq(testCases.id, identity.loginTestId), ownedBy(testCases.userId, identity.userId)));
  const target = WebTargetSchema.safeParse(flow?.target);
  const plan = ExecutablePlanSchema.safeParse(flow?.plan);

  if (!flow || !target.success || !plan.success || target.data.loginIdentityId)
    throw new WorkspaceError('请选择已保存画板且不引用登录身份的 Web 登录流程。');
  if (new URL(target.data.url).origin !== new URL(identity.website).origin)
    throw new WorkspaceError('登录流程必须属于该身份的网站。');

  return { ...flow, target: target.data, plan: plan.data };
}

export async function assertLoginIdentityReference(
  target: TestTarget | undefined,
  userId: UserScope,
  tx: Tx | typeof db = db,
) {
  if (target?.platform !== 'web' || !target.loginIdentityId) return;
  const identity = await identityFor(target.loginIdentityId, userId, tx, true);

  if (new URL(target.url).origin !== new URL(identity.website).origin)
    throw new WorkspaceError('登录身份与用例的网站不匹配。');
  await loginFlow(identity, tx);
}

export async function readLoginIdentities(userId: UserScope) {
  const identities = await db
    .select()
    .from(loginIdentities)
    .where(ownedBy(loginIdentities.userId, userId))
    .orderBy(desc(loginIdentities.updatedAt));
  const cases = await db
    .select()
    .from(testCases)
    .where(ownedBy(testCases.userId, userId))
    .orderBy(desc(testCases.updatedAt));
  const runs = identities.some((item) => item.verificationRunId)
    ? await db
        .select({ id: testRuns.id, status: testRuns.status, startedAt: testRuns.startedAt })
        .from(testRuns)
        .where(
          and(
            ownedBy(testRuns.userId, userId),
            inArray(
              testRuns.id,
              identities.flatMap((item) =>
                item.verificationRunId ? [item.verificationRunId] : [],
              ),
            ),
          ),
        )
    : [];

  return {
    identities: identities.map((item): LoginIdentity => {
      const verification = runs.find((run) => run.id === item.verificationRunId);
      const status =
        verification &&
        ['queued', 'preparing', 'running', 'finalizing'].includes(verification.status)
          ? 'verifying'
          : item.lastError ||
              (verification &&
                ['failed', 'cancelled'].includes(verification.status) &&
                (!item.lastVerifiedAt ||
                  Date.parse(item.lastVerifiedAt) < Date.parse(verification.startedAt)))
            ? 'failed'
            : !item.lastVerifiedAt
              ? 'unverified'
              : Date.now() - Date.parse(item.lastVerifiedAt) >= item.ttlMinutes * 60000
                ? 'expired'
                : 'ready';

      return {
        ...item,
        status,
        references: cases
          .filter(
            (test) => test.target?.platform === 'web' && test.target.loginIdentityId === item.id,
          )
          .map(({ id, name }) => ({ id, name })),
      };
    }),
    flows: cases
      .filter(
        (test) =>
          test.target?.platform === 'web' &&
          !test.target.loginIdentityId &&
          ExecutablePlanSchema.safeParse(test.plan).success,
      )
      .map(({ id, name, url, target }) => ({ id, name, url, target: target ?? undefined })),
  };
}

export async function saveLoginIdentity(raw: unknown, userId: UserScope, id?: string) {
  const parsed = loginIdentityInput.safeParse(raw);

  if (!parsed.success)
    throw new WorkspaceError('请填写身份名称、同一网站的登录流程、验证页面和成功标志。');
  const input = parsed.data;

  return db.transaction(async (tx) => {
    const [previous] = id
      ? await tx
          .select()
          .from(loginIdentities)
          .where(and(eq(loginIdentities.id, id), ownedBy(loginIdentities.userId, userId)))
          .for('update')
      : [];

    if (id && !previous) throw new WorkspaceError('登录身份不存在。', 404);
    if ((previous?.version ?? 0) !== input.version)
      throw new WorkspaceError('登录身份已更新，请刷新后重试。', 409);
    const flow = await loginFlow({ ...input, userId } as typeof loginIdentities.$inferSelect, tx);

    try {
      validateInputReferences(flow.goal, flow.plan, { ...flow.target.inputs, ...input.inputs });
    } catch {
      throw new WorkspaceError('登录流程引用了未配置的输入，请补充账号与密钥引用。');
    }

    const { version, ...config } = input;
    const values = {
      ...config,
      userId,
      version: version + 1,
      lastVerifiedAt: null,
      lastError: null,
      verificationRunId: null,
      updatedAt: new Date().toISOString(),
    };
    const [saved] = previous
      ? await tx
          .update(loginIdentities)
          .set(values)
          .where(eq(loginIdentities.id, previous.id))
          .returning()
      : await tx.insert(loginIdentities).values(values).returning();

    if (previous)
      await tx.delete(loginStateCaches).where(eq(loginStateCaches.identityId, previous.id));

    return saved;
  });
}

export async function clearLoginState(id: string, userId: UserScope) {
  return db.transaction(async (tx) => {
    await identityFor(id, userId, tx);
    await tx.delete(loginStateCaches).where(eq(loginStateCaches.identityId, id));
    await tx
      .update(loginIdentities)
      .set({ lastVerifiedAt: null, lastError: null, version: sql`${loginIdentities.version} + 1` })
      .where(eq(loginIdentities.id, id));
  });
}

export async function deleteLoginIdentity(id: string, userId: UserScope) {
  return db.transaction(async (tx) => {
    await tx
      .select()
      .from(loginIdentities)
      .where(and(eq(loginIdentities.id, id), ownedBy(loginIdentities.userId, userId)))
      .for('update');
    await identityFor(id, userId, tx);
    const [test] = await tx
      .select({ id: testCases.id })
      .from(testCases)
      .where(
        and(
          ownedBy(testCases.userId, userId),
          sql`${testCases.target}->>'loginIdentityId' = ${id}`,
        ),
      )
      .limit(1);
    const [run] = await tx
      .select({ id: testRuns.id })
      .from(testRuns)
      .where(
        and(
          ownedBy(testRuns.userId, userId),
          sql`${testRuns.targetSnapshot}->>'loginIdentityId' = ${id}`,
          inArray(testRuns.status, ['queued', 'preparing', 'running', 'finalizing']),
        ),
      )
      .limit(1);

    if (test || run)
      throw new WorkspaceError('该身份仍被用例引用或正在执行，请先解除引用并等待执行结束。', 409);
    await tx.delete(loginIdentities).where(eq(loginIdentities.id, id));
  });
}
