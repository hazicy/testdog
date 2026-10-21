import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('removes issue category while preserving issue data, evidence and verification links', async () => {
  const client = new PGlite();
  const directory = join(process.cwd(), 'drizzle');
  const migration = '20261021152449_remove_issue_category';
  const tables = ['issue_occurrences', 'issue_verifications', 'test_runs'];
  const rows = () =>
    Promise.all(tables.map(async (table) => (await client.query(`SELECT * FROM ${table}`)).rows));

  try {
    for (const entry of (await readdir(directory)).filter((name) => /^\d{14}_/.test(name)).sort()) {
      if (entry >= migration) break;
      await client.exec(await readFile(join(directory, entry, 'migration.sql'), 'utf8'));
    }

    await client.exec(`
      WITH issue AS (
        INSERT INTO issues (title,category) VALUES ('Payment mismatch','execution') RETURNING id
      ), run AS (
        INSERT INTO test_runs (name,goal,status,"targetSnapshot")
        VALUES ('Check payment','Verify amount','failed','{"schemaVersion":1,"platform":"web","url":"https://example.com"}') RETURNING id
      ), occurrence AS (
        INSERT INTO issue_occurrences ("issueId","runId",snapshot)
        SELECT issue.id,run.id,'{"error":"Actual amount is 120"}' FROM issue,run RETURNING id,"issueId","runId"
      )
      INSERT INTO issue_verifications ("issueId","occurrenceId","runId")
      SELECT "issueId",id,"runId" FROM occurrence;
    `);
    const before = await rows();
    const [issue] = (await client.query<Record<string, unknown>>('SELECT * FROM issues')).rows;
    const { category, ...preserved } = issue;

    expect(category).toBe('execution');
    await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
    expect((await client.query('SELECT * FROM issues')).rows).toEqual([preserved]);
    expect(await rows()).toEqual(before);
  } finally {
    await client.close();
  }
}, 30000);
