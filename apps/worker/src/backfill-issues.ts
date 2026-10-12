import './environment';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, pool } from '@testdog/server/db';
import { issues, testRuns } from '@testdog/server/db/schema';
import { ownedBy } from '@testdog/server/shared/ownership';
import { createIssuesForFailedRun } from '@testdog/server/issues/repository';

async function main() {
  const [scope, userId, extra] = process.argv.slice(2);

  if (
    extra ||
    !['--all', '--unowned', '--user'].includes(scope) ||
    (scope === '--user' ? !userId : !!userId)
  )
    throw new Error('用法：pnpm issues:backfill --all | --unowned | --user <用户ID>');
  const runs = await db
    .select({ id: testRuns.id })
    .from(testRuns)
    .where(
      and(
        eq(testRuns.status, 'failed'),
        scope === '--all' ? undefined : ownedBy(testRuns.userId, userId ?? null),
      ),
    )
    .orderBy(asc(testRuns.startedAt), asc(testRuns.id));
  const count = async () =>
    (await db.select({ count: sql<number>`count(*)::int` }).from(issues))[0].count;
  const before = await count();

  for (const run of runs) await db.transaction((tx) => createIssuesForFailedRun(run.id, tx));
  console.log({ failedRunsProcessed: runs.length, issuesCreated: (await count()) - before });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
