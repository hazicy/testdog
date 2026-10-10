import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('moves historical logs in order, compacts the run row, and cascades deletion', async () => {
  const client = new PGlite();
  try {
    const directory = join(process.cwd(), 'drizzle');
    const entries = (await readdir(directory)).filter((entry) => /^\d{14}_/.test(entry)).sort();
    const migration = '20261010024139_spotty_blacklash';
    for (const entry of entries.filter((entry) => entry < migration)) {
      await client.exec(await readFile(join(directory, entry, 'migration.sql'), 'utf8'));
    }
    const id = randomUUID();
    const logs = [
      { id: randomUUID(), kind: 'console', message: 'first' },
      { id: randomUUID(), kind: 'console', message: 'second' },
    ];

    await client.query(
      'INSERT INTO test_runs (id, name, url, goal, status, "browserLogs") VALUES ($1, $2, $3, $4, $5, $6)',
      [id, 'History', 'https://example.com', 'Check', 'passed', JSON.stringify(logs)],
    );
    await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
    expect(
      (await client.query('SELECT data FROM run_browser_logs ORDER BY sequence')).rows,
    ).toEqual(logs.map((data) => ({ data })));
    expect(
      (await client.query('SELECT "browserLogs" FROM test_runs WHERE id=$1', [id])).rows,
    ).toEqual([{ browserLogs: [] }]);
    await client.query('DELETE FROM test_runs WHERE id=$1', [id]);
    expect((await client.query('SELECT * FROM run_browser_logs')).rows).toEqual([]);
  } finally {
    await client.close();
  }
}, 30000);
