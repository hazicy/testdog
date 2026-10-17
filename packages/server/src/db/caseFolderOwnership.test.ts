import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';

test('converts shared memberships to one location without deleting cases, folders or run history', async () => {
  const client = new PGlite();
  const directory = join(process.cwd(), 'drizzle');
  const migration = '20261017114000_case_folder_ownership';
  const first = '9e88ea6e-6eb8-4f52-b540-e7aaeb7b0011';
  const second = '9e88ea6e-6eb8-4f52-b540-e7aaeb7b0012';
  const item = '9e88ea6e-6eb8-4f52-b540-e7aaeb7b0013';

  try {
    for (const name of (await readdir(directory)).filter((name) => /^\d{14}_/.test(name)).sort()) {
      if (name >= migration) break;
      await client.exec(await readFile(join(directory, name, 'migration.sql'), 'utf8'));
    }

    await client.query("INSERT INTO test_suites (id,name) VALUES ($1,'First'),($2,'Second')", [
      first,
      second,
    ]);
    await client.query(
      'INSERT INTO test_cases (id,name,goal,target) VALUES ($1,\'Login\',\'Check\',\'{"schemaVersion":1,"platform":"web","url":"https://example.com"}\')',
      [item],
    );
    await client.query(
      'INSERT INTO suite_cases ("suiteId","testId",position) VALUES ($1,$3,0),($2,$3,0)',
      [first, second, item],
    );
    await client.query('INSERT INTO suite_runs ("suiteId",name,total) VALUES ($1,\'Snapshot\',1)', [
      second,
    ]);
    await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
    expect((await client.query('SELECT "suiteId" FROM suite_cases')).rows).toEqual([
      { suiteId: first },
    ]);
    expect((await client.query('SELECT id FROM test_cases')).rows).toEqual([{ id: item }]);
    expect((await client.query('SELECT id FROM test_suites')).rows).toHaveLength(2);
    expect((await client.query('SELECT name,total,"suiteId" FROM suite_runs')).rows).toEqual([
      { name: 'Snapshot', total: 1, suiteId: second },
    ]);
    await expect(
      client.query('INSERT INTO suite_cases ("suiteId","testId",position) VALUES ($1,$2,0)', [
        second,
        item,
      ]),
    ).rejects.toMatchObject({ code: '23505' });
  } finally {
    await client.close();
  }
}, 30000);
