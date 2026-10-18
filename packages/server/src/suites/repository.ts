import { descendantSuiteIds } from '@testdog/contracts/suites/tree';
import type { SuiteTreeCase, SuiteTreeNode } from '@testdog/contracts/suites/types';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import { testSuites, testCases, testRuns } from '@testdog/server/db/schema';
import { ownedBy, ownershipValues, type UserScope } from '@testdog/server/shared/ownership';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { validId } from '@testdog/server/shared/http';
import { pageCursor, searchPattern, type PageQuery } from '@testdog/server/shared/pagination';
import { suiteInputSchema, suiteUpdateSchema } from '@testdog/contracts/suites/schemas';
import { targetUrl } from '@testdog/contracts/automation/platform/target';
import { lockTree, folderFor } from './folders';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function readTree(scope: UserScope, tx: Tx) {
  const folders = await tx
    .select()
    .from(testSuites)
    .where(ownedBy(testSuites, scope))
    .orderBy(testSuites.position, testSuites.name, testSuites.id);
  const cases = await tx
    .select({ id: testCases.id, name: testCases.name, folderId: testCases.folderId })
    .from(testCases)
    .where(ownedBy(testCases, scope))
    .orderBy(testCases.folderPosition, testCases.name, testCases.id);
  const latestRuns = await tx
    .selectDistinctOn([testRuns.testId], { testId: testRuns.testId, status: testRuns.status })
    .from(testRuns)
    .where(and(ownedBy(testRuns, scope), isNotNull(testRuns.testId)))
    .orderBy(testRuns.testId, desc(testRuns.startedAt), desc(testRuns.id));
  const latestStatuses = new Map(latestRuns.map((run) => [run.testId, run.status]));
  const nodes = new Map<string, SuiteTreeNode>(
    folders.map((folder) => [folder.id, { ...folder, tests: [], testCount: 0, totalTestCount: 0 }]),
  );
  const rootTests: SuiteTreeCase[] = [];

  for (const { id, name, folderId } of cases) {
    const test = { id, name, latestStatus: latestStatuses.get(id) };

    if (!folderId) rootTests.push(test);
    else nodes.get(folderId)?.tests.push(test);
  }

  // Process leaves first so each folder contributes its count to its parent once.
  const remainingChildren = new Map<string, number>();

  for (const folder of folders)
    if (folder.parentId)
      remainingChildren.set(folder.parentId, (remainingChildren.get(folder.parentId) ?? 0) + 1);
  const leaves: SuiteTreeNode[] = [];

  for (const node of nodes.values()) {
    node.totalTestCount = node.testCount = node.tests.length;
    if (!remainingChildren.has(node.id)) leaves.push(node);
  }

  while (leaves.length) {
    const node = leaves.pop()!;
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;

    if (!parent) continue;
    parent.totalTestCount += node.totalTestCount;
    const remaining = remainingChildren.get(parent.id)! - 1;

    remainingChildren.set(parent.id, remaining);
    if (!remaining) leaves.push(parent);
  }

  return { folders: [...nodes.values()], rootTests };
}

export async function getSuiteTree(scope: UserScope) {
  return db.transaction((tx) => readTree(scope, tx), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  });
}

export async function listSuites({ limit, q, cursor }: PageQuery, scope: UserScope) {
  const rows = await db
    .select({
      id: testSuites.id,
      name: testSuites.name,
      parentId: testSuites.parentId,
      position: testSuites.position,
      version: testSuites.version,
      updatedAt: testSuites.updatedAt,
      testCount: sql<number>`(select count(*)::int from test_cases where "folderId" = ${testSuites.id})`,
    })
    .from(testSuites)
    .where(
      and(
        ownedBy(testSuites, scope),
        q ? sql`${testSuites.name} ilike ${searchPattern(q)}` : undefined,
        cursor
          ? sql`(${testSuites.updatedAt}, ${testSuites.id}) < (${cursor.date}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(testSuites.updatedAt), desc(testSuites.id))
    .limit(limit + 1);
  const tree = await getSuiteTree(scope);
  const suites = rows.slice(0, limit).map((row) => ({
    ...row,
    totalTestCount:
      tree.folders.find((folder) => folder.id === row.id)?.totalTestCount ?? row.testCount,
  }));
  const last = suites.at(-1);

  return {
    suites,
    nextCursor: rows.length > limit && last ? pageCursor(last.updatedAt, last.id) : null,
  };
}

export async function getSuite(id: string, scope: UserScope) {
  return db.transaction(
    async (tx) => {
      const suite = await folderFor(id, scope, tx);
      const tree = await readTree(scope, tx);
      const rows = await tx
        .select()
        .from(testCases)
        .where(and(eq(testCases.folderId, id), ownedBy(testCases, scope)))
        .orderBy(asc(testCases.folderPosition), asc(testCases.id));

      return {
        id: suite.id,
        name: suite.name,
        parentId: suite.parentId,
        position: suite.position,
        totalTestCount:
          tree.folders.find((folder) => folder.id === id)?.totalTestCount ?? rows.length,
        folders: tree.folders.filter((folder) => folder.parentId === id),
        version: suite.version,
        updatedAt: suite.updatedAt,
        testCount: rows.length,
        tests: rows.map((test) => ({ ...test, url: targetUrl(test.target) })),
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

export async function saveSuite(id: string | undefined, raw: unknown, scope: UserScope) {
  const parsed = (id ? suiteUpdateSchema : suiteInputSchema).safeParse(raw);

  if (!parsed.success)
    throw new WorkspaceError(parsed.error.issues[0]?.message || '合集参数无效。');
  const input = parsed.data;
  const testIds = input.testIds ?? [];

  return db.transaction(async (tx) => {
    await lockTree(tx, scope);
    const existing = id ? await folderFor(id, scope, tx, 'update') : undefined;
    const folders = await tx.select().from(testSuites).where(ownedBy(testSuites, scope));

    if (input.parentId && !folders.some((folder) => folder.id === input.parentId))
      throw new WorkspaceError('目标合集不存在。', 404);
    if (id && input.parentId && descendantSuiteIds(folders, id).has(input.parentId))
      throw new WorkspaceError('不能将合集移入自身或子合集。', 409);
    const position =
      existing?.parentId === input.parentId
        ? existing.position
        : Math.max(
            -1,
            ...folders
              .filter((folder) => folder.parentId === input.parentId)
              .map((folder) => folder.position),
          ) + 1;

    if (existing && (!('version' in input) || input.version !== existing.version))
      throw new WorkspaceError('合集已更新，请刷新后再编辑。', 409);
    const tests = testIds.length
      ? await tx
          .select({ id: testCases.id })
          .from(testCases)
          .where(and(inArray(testCases.id, testIds), ownedBy(testCases, scope)))
          .orderBy(testCases.id)
          .for('share')
      : [];

    if (tests.length !== testIds.length)
      throw new WorkspaceError('部分用例不存在或不属于当前工作区，请重新选择。', 409);
    const [suite] = existing
      ? await tx
          .update(testSuites)
          .set({
            name: input.name,
            parentId: input.parentId,
            position,
            version: existing.version + 1,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(testSuites.id, existing.id))
          .returning()
      : await tx
          .insert(testSuites)
          .values({
            ...ownershipValues(scope),
            name: input.name,
            parentId: input.parentId,
            position,
          })
          .returning();

    if (existing && input.testIds !== undefined)
      await tx
        .update(testCases)
        .set({ folderId: null, folderPosition: 0 })
        .where(and(eq(testCases.folderId, suite.id), ownedBy(testCases, scope)));
    for (const [folderPosition, testId] of testIds.entries())
      await tx
        .update(testCases)
        .set({ folderId: suite.id, folderPosition })
        .where(and(eq(testCases.id, testId), ownedBy(testCases, scope)));

    return { id: suite.id };
  });
}

export async function deleteSuite(id: string, scope: UserScope) {
  validId(id);
  await db.transaction(async (tx) => {
    await lockTree(tx, scope);
    const deleted = await tx
      .delete(testSuites)
      .where(and(eq(testSuites.id, id), ownedBy(testSuites, scope)))
      .returning({ id: testSuites.id });

    if (!deleted.length) throw new WorkspaceError('测试合集不存在。', 404);
  });
}
