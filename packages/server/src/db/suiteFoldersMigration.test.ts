import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';

test('adds folder hierarchy without rewriting existing suites, membership or batch history', async () => {
  const client = new PGlite();
  const directory = join(process.cwd(), 'drizzle');
  const migration = '20261017101110_suite_folders';
  const suiteId = '9e88ea6e-6eb8-4f52-b540-e7aaeb7b0001';
  const testId = '9e88ea6e-6eb8-4f52-b540-e7aaeb7b0002';

  try {
    for (const name of (await readdir(directory)).filter((name) => /^\d{14}_/.test(name)).sort()) {
      if (name >= migration) break;
      await client.exec(await readFile(join(directory, name, 'migration.sql'), 'utf8'));
    }

    await client.exec(
      "INSERT INTO auth_users (id,name,email) VALUES ('existing','Existing','existing@example.com')",
    );
    await client.query(
      "INSERT INTO test_suites (id,name,\"userId\") VALUES ($1,'Smoke','existing')",
      [suiteId],
    );
    await client.query(
      'INSERT INTO test_cases (id,name,goal,target,"userId") VALUES ($1,\'Login\',\'Check\',\'{"schemaVersion":1,"platform":"web","url":"https://example.com"}\',\'existing\')',
      [testId],
    );
    await client.query('INSERT INTO suite_cases ("suiteId","testId",position) VALUES ($1,$2,0)', [
      suiteId,
      testId,
    ]);
    await client.query(
      'INSERT INTO suite_runs ("suiteId",name,total,"userId") VALUES ($1,\'Smoke snapshot\',1,\'existing\')',
      [suiteId],
    );
    await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
    expect(
      (await client.query('SELECT id,name,"parentId",position FROM test_suites')).rows,
    ).toEqual([{ id: suiteId, name: 'Smoke', parentId: null, position: 0 }]);
    expect((await client.query('SELECT "testId" FROM suite_cases')).rows).toEqual([{ testId }]);
    expect((await client.query('SELECT name,total FROM suite_runs')).rows).toEqual([
      { name: 'Smoke snapshot', total: 1 },
    ]);
  } finally {
    await client.close();
  }
}, 30000);
