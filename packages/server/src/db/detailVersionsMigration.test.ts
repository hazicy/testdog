import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

it('backfills existing run representations and preserves cascade cleanup', async () => {
  const client = new PGlite();
  const directory = join(process.cwd(), 'drizzle');
  const migration = '20261019092446_motionless_morlun';
  const id = randomUUID();

  try {
    for (const name of (await readdir(directory))
      .filter((name) => /^\d{14}_/.test(name) && name < migration)
      .sort())
      await client.exec(await readFile(join(directory, name, 'migration.sql'), 'utf8'));
    await client.query(
      `INSERT INTO test_runs (id,name,goal,status,"targetSnapshot") VALUES ($1,'Existing','Check','passed','{"schemaVersion":1,"platform":"web","url":"https://example.com","browser":"chromium","deviceProfile":"legacy-desktop"}')`,
      [id],
    );
    await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
    const before = await client.query<{ version: string }>(
      'SELECT version FROM run_detail_versions WHERE "runId"=$1',
      [id],
    );

    expect(before.rows[0].version).toMatch(/^[0-9a-f-]{36}$/);
    await client.query('UPDATE test_runs SET name=$2 WHERE id=$1', [id, 'Changed']);
    const after = await client.query<{ version: string }>(
      'SELECT version FROM run_detail_versions WHERE "runId"=$1',
      [id],
    );

    expect(after.rows[0].version).not.toBe(before.rows[0].version);
    await client.query('DELETE FROM test_runs WHERE id=$1', [id]);
    expect((await client.query('SELECT * FROM run_detail_versions')).rows).toEqual([]);
  } finally {
    await client.close();
  }
}, 30000);
