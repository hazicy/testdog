import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import { testCases, testSuites } from '@testdog/server/db/schema';
import { ownedBy, type UserScope } from '@testdog/server/shared/ownership';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { validId } from '@testdog/server/shared/http';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Serialize hierarchy changes and batch snapshots within one workspace.
export async function lockTree(tx: Tx, scope: UserScope) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${'testdog:suites:' + (scope ?? 'legacy')}, 0))`,
  );
}

export async function caseFolderValues(tx: Tx, folderId: string | null, scope: UserScope) {
  if (!folderId) return { folderId: null, folderPosition: 0 };
  validId(folderId);
  const [folder] = await tx
    .select({ id: testSuites.id })
    .from(testSuites)
    .where(and(eq(testSuites.id, folderId), ownedBy(testSuites, scope)));

  if (!folder) throw new WorkspaceError('目标合集不存在。', 404);
  const [last] = await tx
    .select({ position: sql<number>`coalesce(max(${testCases.folderPosition}), -1)::int` })
    .from(testCases)
    .where(eq(testCases.folderId, folderId));

  return { folderId, folderPosition: last.position + 1 };
}

export async function moveTest(id: string, folderId: string | null, scope: UserScope) {
  return moveTests([id], folderId, scope);
}

export async function moveTests(testIds: string[], folderId: string | null, scope: UserScope) {
  const ids = [...new Set(testIds)].sort();

  if (!ids.length) throw new WorkspaceError('请选择要移动的用例。');
  for (const id of ids) validId(id);
  await db.transaction(async (tx) => {
    await lockTree(tx, scope);
    const tests = await tx
      .select({ id: testCases.id })
      .from(testCases)
      .where(and(inArray(testCases.id, ids), ownedBy(testCases, scope)))
      .orderBy(testCases.id)
      .for('update');

    if (tests.length !== ids.length) throw new WorkspaceError('部分用例不存在或不可访问。', 404);
    const location = await caseFolderValues(tx, folderId, scope);

    for (const [index, test] of tests.entries())
      await tx
        .update(testCases)
        .set({
          folderId: location.folderId,
          folderPosition: folderId ? location.folderPosition + index : 0,
        })
        .where(eq(testCases.id, test.id));
  });
}

export async function folderFor(id: string, scope: UserScope, tx: Tx, lock?: 'update' | 'share') {
  validId(id);
  const query = tx
    .select()
    .from(testSuites)
    .where(and(eq(testSuites.id, id), ownedBy(testSuites, scope)));
  const [folder] = await (lock ? query.for(lock) : query);

  if (!folder) throw new WorkspaceError('合集不存在。', 404);

  return folder;
}
