import { eq, isNull } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

// null identifies unassigned local data. It never grants access to other users.
export type UserScope = string | null;

export function ownedBy(column: PgColumn, userId: UserScope) {
  return userId === null ? isNull(column) : eq(column, userId);
}

export function workspaceChannel(userId: UserScope) {
  return userId === null ? 'workspace:legacy' : `workspace:user:${userId}`;
}
