import { randomUUID } from 'node:crypto';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { setTimeout as delay } from 'node:timers/promises';
import type { BrowserContextOptions } from 'playwright';
import { db } from '@testdog/server/db';
import { loginIdentities, loginStateCaches } from '@testdog/server/db/schema';
import { encryptSecret, decryptSecret } from '@testdog/server/shared/secrets';
import type { UserScope } from '@testdog/server/shared/ownership';

export type LoginState = Exclude<BrowserContextOptions['storageState'], string | undefined>;

export async function readCachedLoginState(key: string, userId: UserScope) {
  const [row] = await db.select().from(loginStateCaches).where(eq(loginStateCaches.key, key));

  if (!row?.encryptedState || !row.expiresAt || Date.parse(row.expiresAt) <= Date.now())
    return undefined;
  try {
    return decryptSecret(row.encryptedState, userId, `login-state:${key}`) as LoginState;
  } catch {
    return undefined;
  }
}

export async function withLoginRefreshLock<T>(
  key: string,
  identityId: string,
  signal: AbortSignal,
  refresh: (publish: (state: LoginState, ttlMinutes: number) => Promise<void>) => Promise<T>,
) {
  const token = randomUUID();

  await db.insert(loginStateCaches).values({ key, identityId }).onConflictDoNothing();
  while (true) {
    signal.throwIfAborted();
    const [locked] = await db
      .update(loginStateCaches)
      .set({ lockToken: token, lockUntil: new Date(Date.now() + 90000).toISOString() })
      .where(
        and(
          eq(loginStateCaches.key, key),
          or(isNull(loginStateCaches.lockToken), sql`${loginStateCaches.lockUntil} < now()`),
        ),
      )
      .returning();

    if (locked) break;
    // Cache clearing or an identity edit invalidates waiting refreshes instead of spinning forever.
    const [exists] = await db
      .select({ key: loginStateCaches.key })
      .from(loginStateCaches)
      .where(eq(loginStateCaches.key, key));

    if (!exists) throw new Error('登录身份已更新，请重新执行。');
    await delay(250, undefined, { signal });
  }

  const guard = and(eq(loginStateCaches.key, key), eq(loginStateCaches.lockToken, token));
  const renew = setInterval(() => {
    void db
      .update(loginStateCaches)
      .set({ lockUntil: new Date(Date.now() + 90000).toISOString() })
      .where(guard)
      .catch(() => {});
  }, 15000);

  try {
    return await refresh(async (state, ttlMinutes) => {
      signal.throwIfAborted();
      const [identity] = await db
        .select()
        .from(loginIdentities)
        .where(eq(loginIdentities.id, identityId));

      if (!identity) throw new Error('登录身份已删除。');
      const [saved] = await db
        .update(loginStateCaches)
        .set({
          encryptedState: encryptSecret(state, identity.userId, `login-state:${key}`),
          expiresAt: new Date(Date.now() + ttlMinutes * 60000).toISOString(),
        })
        .where(and(guard, sql`${loginStateCaches.lockUntil} > now()`))
        .returning();

      if (!saved) throw new Error('登录身份已更新，请重新执行。');
    });
  } finally {
    clearInterval(renew);
    await db.update(loginStateCaches).set({ lockToken: null, lockUntil: null }).where(guard);
  }
}
