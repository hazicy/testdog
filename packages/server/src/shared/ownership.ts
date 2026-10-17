import { and, eq, isNull } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

// Personal IDs retain their existing representation. Team scopes use a reserved prefix.
// null identifies unassigned local data, never team data.
export type UserScope = string | null;

export function assertUserScope(scope: unknown): asserts scope is UserScope {
  if (scope !== null && (typeof scope !== 'string' || !scope))
    throw new TypeError('查询必须指定工作区或 null（无归属数据）');
}

export function teamScope(teamId: string) {
  return `team:${teamId}`;
}

export function ownershipValues(scope: UserScope) {
  assertUserScope(scope);

  return typeof scope === 'string' && scope.startsWith('team:')
    ? { userId: null, teamId: scope.slice(5) }
    : { userId: scope, teamId: null };
}

export function rowScope(row: { userId: string | null; teamId?: string | null }): UserScope {
  return row.teamId ? teamScope(row.teamId) : row.userId;
}

export function ownedBy(table: { userId: PgColumn; teamId: PgColumn }, scope: UserScope) {
  const owner = ownershipValues(scope);

  return owner.teamId
    ? eq(table.teamId, owner.teamId)
    : and(
        isNull(table.teamId),
        owner.userId === null ? isNull(table.userId) : eq(table.userId, owner.userId),
      );
}

export function workspaceChannel(scope: UserScope) {
  assertUserScope(scope);

  return scope === null ? 'workspace:legacy' : `workspace:user:${scope}`;
}
