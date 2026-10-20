import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('removes issue activity while preserving issues, evidence links, verification and realtime updates', async () => {
  const client = new PGlite();
  const directory = join(process.cwd(), 'drizzle');
  const migration = '20261020135159_remove_issue_activity';
  const tables = ['issues', 'issue_occurrences', 'issue_verifications', 'test_runs'];
  const rows = () =>
    Promise.all(tables.map(async (table) => (await client.query(`SELECT * FROM ${table}`)).rows));

  try {
    for (const entry of (await readdir(directory)).filter((name) => /^\d{14}_/.test(name)).sort()) {
      if (entry >= migration) break;
      await client.exec(await readFile(join(directory, entry, 'migration.sql'), 'utf8'));
    }

    await client.exec(`
      WITH issue AS (
        INSERT INTO issues (title) VALUES ('Payment mismatch') RETURNING id
      ), run AS (
        INSERT INTO test_runs (name,goal,status,"targetSnapshot")
        VALUES ('Check payment','Verify amount','failed','{"schemaVersion":1,"platform":"web","url":"https://example.com"}')
        RETURNING id
      ), occurrence AS (
        INSERT INTO issue_occurrences ("issueId","runId",snapshot)
        SELECT issue.id,run.id,'{}' FROM issue,run RETURNING id,"issueId","runId"
      ), verification AS (
        INSERT INTO issue_verifications ("issueId","occurrenceId","runId")
        SELECT "issueId",id,"runId" FROM occurrence
      )
      INSERT INTO issue_events ("issueId",kind,message)
      SELECT id,'comment','Investigating' FROM issue;
    `);
    const before = await rows();

    await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
    expect(await rows()).toEqual(before);
    expect((await client.query("SELECT to_regclass('issue_events') AS activity")).rows).toEqual([
      { activity: null },
    ]);
    await client.exec('DELETE FROM realtime_outbox');
    await client.exec("UPDATE issues SET status='in_progress'");
    expect(
      (await client.query("SELECT kind,summary FROM realtime_outbox WHERE kind='issues'")).rows,
    ).toEqual([
      { kind: 'issues', summary: true },
      { kind: 'issues', summary: false },
    ]);
  } finally {
    await client.close();
  }
}, 30000);
