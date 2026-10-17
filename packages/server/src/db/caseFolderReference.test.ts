import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';

test('moves folder membership into case foreign keys and preserves order, cases and run history', async () => {
  const client = new PGlite();
  const directory = join(process.cwd(), 'drizzle');
  const migration = '20261017115000_case_folder_reference';
  const root = '9e88ea6e-6eb8-4f52-b540-e7aaeb7b0021';
  const child = '9e88ea6e-6eb8-4f52-b540-e7aaeb7b0022';
  const item = '9e88ea6e-6eb8-4f52-b540-e7aaeb7b0023';

  try {
    for (const name of (await readdir(directory)).filter((name) => /^\d{14}_/.test(name)).sort()) {
      if (name >= migration) break;
      await client.exec(await readFile(join(directory, name, 'migration.sql'), 'utf8'));
    }

    await client.query(
      "INSERT INTO test_suites (id,name,\"parentId\") VALUES ($1,'Root',null),($2,'Child',$1)",
      [root, child],
    );
    await client.query(
      'INSERT INTO test_cases (id,name,goal,target) VALUES ($1,\'Login\',\'Check\',\'{"schemaVersion":1,"platform":"web","url":"https://example.com"}\')',
      [item],
    );
    await client.query('INSERT INTO suite_cases ("suiteId","testId",position) VALUES ($1,$2,7)', [
      child,
      item,
    ]);
    await client.query(
      'INSERT INTO suite_runs ("suiteId",name,total) VALUES ($1,\'Immutable batch\',1)',
      [child],
    );
    await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
    expect(
      (await client.query('SELECT id,"folderId","folderPosition" FROM test_cases')).rows,
    ).toEqual([{ id: item, folderId: child, folderPosition: 7 }]);
    expect((await client.query("SELECT to_regclass('suite_cases') AS relation")).rows).toEqual([
      { relation: null },
    ]);
    await expect(
      client.query('UPDATE test_cases SET "folderId" = $1', [item]),
    ).rejects.toMatchObject({ code: '23503' });
    await client.query('DELETE FROM test_suites WHERE id = $1', [root]);
    expect((await client.query('SELECT id,"folderId" FROM test_cases')).rows).toEqual([
      { id: item, folderId: null },
    ]);
    expect((await client.query('SELECT name,total,"suiteId" FROM suite_runs')).rows).toEqual([
      { name: 'Immutable batch', total: 1, suiteId: null },
    ]);
  } finally {
    await client.close();
  }
}, 30000);
