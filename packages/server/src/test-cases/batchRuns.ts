import { and, inArray } from 'drizzle-orm';
import { caseBatchRequestSchema } from '@testdog/contracts/test-cases/batchRuns';
import { testCases, suiteRuns } from '@testdog/server/db/schema';
import { submitOnce } from '@testdog/server/shared/idempotency';
import { ownedBy, ownershipValues, type UserScope } from '@testdog/server/shared/ownership';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { createCaseRuns } from '@testdog/server/runs/submission';
import { lockTree } from '@testdog/server/suites/folders';
import { testFilter } from './filter';

export async function startCaseBatch(request: Request, raw: unknown, scope: UserScope) {
  const parsed = caseBatchRequestSchema.safeParse(raw);

  if (!parsed.success) throw new WorkspaceError('批量执行参数无效。');
  const input = parsed.data;

  return submitOnce(
    request,
    input,
    async (tx) => {
      await lockTree(tx, scope);
      const ids = input.mode === 'selected' ? [...new Set(input.testIds)].sort() : [];
      const tests = await tx
        .select({
          id: testCases.id,
          target: testCases.target,
          name: testCases.name,
          goal: testCases.goal,
          plan: testCases.plan,
        })
        .from(testCases)
        .where(
          input.mode === 'selected'
            ? and(ownedBy(testCases, scope), inArray(testCases.id, ids))
            : testFilter(input, scope, input.folderId),
        )
        .orderBy(testCases.id)
        .for('share');

      if (input.mode === 'selected' && tests.length !== ids.length)
        throw new WorkspaceError('部分用例不存在或不可访问，请刷新后重试。', 404);
      if (!tests.length) throw new WorkspaceError('没有符合条件的可运行用例。', 409);
      const [batch] = await tx
        .insert(suiteRuns)
        .values({
          ...ownershipValues(scope),
          suiteId: null,
          name: input.mode === 'selected' ? '所选用例' : '筛选用例',
          total: tests.length,
        })
        .returning();

      await createCaseRuns(tests, batch.id, tx, scope);

      return { batchId: batch.id };
    },
    scope,
  );
}
