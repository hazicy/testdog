import { ownedBy } from '@testdog/server/shared/ownership';
import '../environment';
import { eq } from 'drizzle-orm';
import { db, pool } from '@testdog/server/db';
import {
  authUsers,
  testCases,
  testRuns,
  submissionRequests,
  realtimeOutbox,
  testSuites,
  suiteRuns,
} from '@testdog/server/db/schema';

// Explicit operator command. Registration and migrations never claim legacy data.
async function main() {
  const [email, extra] = process.argv.slice(2);

  if (!email || extra) throw new Error('用法：pnpm assign:legacy <已注册用户的邮箱>');
  const [user] = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.email, email.trim().toLowerCase()));

  if (!user) throw new Error('用户不存在，请先通过 /register 注册。');
  const counts = await db.transaction(async (tx) => {
    const patch = { userId: user.id };
    const tests = await tx
      .update(testCases)
      .set(patch)
      .where(ownedBy(testCases, null))
      .returning({ id: testCases.id });
    const runs = await tx
      .update(testRuns)
      .set(patch)
      .where(ownedBy(testRuns, null))
      .returning({ id: testRuns.id });
    // Old deduplication keys must not collide with this user's newer submissions.
    // A collision rolls back the entire assignment instead of partially transferring data.
    const requests = await tx
      .update(submissionRequests)
      .set(patch)
      .where(ownedBy(submissionRequests, null))
      .returning({ id: submissionRequests.id });

    await tx.update(realtimeOutbox).set(patch).where(ownedBy(realtimeOutbox, null));

    const suites = await tx
      .update(testSuites)
      .set(patch)
      .where(ownedBy(testSuites, null))
      .returning({ id: testSuites.id });

    await tx.update(suiteRuns).set(patch).where(ownedBy(suiteRuns, null));

    return {
      suites: suites.length,
      tests: tests.length,
      runs: runs.length,
      requests: requests.length,
    };
  });

  console.log('无归属数据已分配给指定用户：', counts);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : '分配失败');
  process.exitCode = 1;
} finally {
  await pool.end();
}
