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

it('preserves late legacy logs, deduplicates retries and removes the legacy column', async () => {
  const client = new PGlite();

  try {
    const directory = join(process.cwd(), 'drizzle');
    const migration = '20261011111451_simplify_legacy_storage';
    const entries = (await readdir(directory)).filter((entry) => /^\d{14}_/.test(entry)).sort();

    for (const entry of entries.filter((entry) => entry < migration))
      await client.exec(await readFile(join(directory, entry, 'migration.sql'), 'utf8'));

    const runId = randomUUID();
    const logs = [
      { id: randomUUID(), kind: 'console', message: 'already persisted' },
      { id: randomUUID(), kind: 'console', message: 'late legacy log' },
    ];

    await client.query(
      `INSERT INTO test_runs (id,name,url,goal,status,"browserLogs") VALUES ($1,'History','https://example.com','Check','passed',$2)`,
      [runId, JSON.stringify(logs)],
    );
    await client.query('INSERT INTO run_browser_logs (id,"runId",data) VALUES ($1,$2,$3)', [
      logs[0].id,
      runId,
      JSON.stringify(logs[0]),
    ]);
    const migrationSql = await readFile(join(directory, migration, 'migration.sql'), 'utf8');

    // Conflicting IDs must fail rather than discard the legacy payload.
    await client.query('UPDATE run_browser_logs SET data = $1 WHERE id = $2', [
      JSON.stringify({ ...logs[0], message: 'conflict' }),
      logs[0].id,
    ]);
    await expect(client.exec(migrationSql)).rejects.toThrow('Legacy browser logs conflict');
    expect((await client.query('SELECT "browserLogs" FROM test_runs')).rows).toEqual([
      { browserLogs: logs },
    ]);
    await client.query('UPDATE run_browser_logs SET data = $1 WHERE id = $2', [
      JSON.stringify(logs[0]),
      logs[0].id,
    ]);
    await client.exec(migrationSql);
    expect(
      (await client.query('SELECT data FROM run_browser_logs ORDER BY sequence')).rows,
    ).toEqual(logs.map((data) => ({ data })));
    expect(
      (
        await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name='test_runs' AND column_name='browserLogs'`,
        )
      ).rows,
    ).toEqual([]);
    await client.query('DELETE FROM test_runs WHERE id=$1', [runId]);
    expect((await client.query('SELECT * FROM run_browser_logs')).rows).toEqual([]);
  } finally {
    await client.close();
  }
}, 30000);
