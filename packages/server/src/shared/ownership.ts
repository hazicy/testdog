import { eq, isNull } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

// null identifies unassigned local data. It never grants access to other users.
export type UserScope = string | null;

export function assertUserScope(userId: unknown): asserts userId is UserScope {
  if (userId !== null && (typeof userId !== 'string' || !userId))
    throw new TypeError('查询必须指定用户 ID 或 null（无归属数据）');
}

export function ownedBy(column: PgColumn, userId: UserScope) {
  assertUserScope(userId);

  return userId === null ? isNull(column) : eq(column, userId);
}

export function workspaceChannel(userId: UserScope) {
  assertUserScope(userId);

  return userId === null ? 'workspace:legacy' : `workspace:user:${userId}`;
}
