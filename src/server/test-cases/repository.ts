import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { testCases } from '@/db/schema';
import { legacyWebTarget } from '@/automation/platform/target';
import type { TestCase } from '@/features/test-cases/types';
import { testSchema } from '@/features/test-cases/schemas';
import { WorkspaceError } from '@/server/shared/errors';

export const listTests = async () =>
  (
    await db
      .select()
      .from(testCases)
      .orderBy(desc(testCases.updatedAt), desc(testCases.id))
      .limit(50)
  ).map((test) => ({
    ...test,
    target: test.target ?? legacyWebTarget(test.url),
  }));

export async function saveTest(
  input: Pick<TestCase, 'name' | 'url' | 'goal' | 'tags' | 'target'>,
  id?: string,
) {
  const parsed = testSchema.safeParse(input);
  if (!parsed.success) throw new WorkspaceError('请填写有效的名称、测试目标和测试步骤。');
  input = {
    ...parsed.data,
    target: input.target ?? {
      schemaVersion: 1,
      platform: 'web',
      url: input.url,
      browser: 'chromium',
      deviceProfile: 'Pixel 7',
    },
  };
  const [test] = id
    ? await db
        .update(testCases)
        .set({ ...input, updatedAt: new Date().toISOString() })
        .where(eq(testCases.id, id))
        .returning()
    : await db.insert(testCases).values(input).returning();
  if (!test) throw new WorkspaceError('用例不存在。', 404);

  return test;
}

export async function deleteTest(id: string) {
  const rows = await db
    .delete(testCases)
    .where(eq(testCases.id, id))
    .returning({ id: testCases.id });
  if (!rows.length) throw new WorkspaceError('用例不存在。', 404);
}
