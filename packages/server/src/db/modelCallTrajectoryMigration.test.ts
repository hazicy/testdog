import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('adds nullable AI trace links without changing old calls and preserves cascade cleanup', async () => {
  const client = new PGlite();
  const directory = join(process.cwd(), 'drizzle');
  const migration = '20261014131445_add_ai_call_trajectory';
  const runId = randomUUID();
  const callId = randomUUID();
  const stepId = randomUUID();

  try {
    for (const name of (await readdir(directory))
      .filter((entry) => /^\d{14}_/.test(entry) && entry < migration)
      .sort())
      await client.exec(await readFile(join(directory, name, 'migration.sql'), 'utf8'));
    await client.query(
      `INSERT INTO test_runs (id,name,goal,status,"targetSnapshot") VALUES ($1,'Run','Click','passed','{"schemaVersion":1,"platform":"web","url":"https://example.com","browser":"chromium","deviceProfile":"Pixel 7"}')`,
      [runId],
    );
    await client.query(
      `INSERT INTO model_calls (id,"runId","startedAt","durationMs",model,status,"retryCount","failedAttempts") VALUES ($1,$2,now(),100,'deepseek-flash','passed',0,0)`,
      [callId, runId],
    );
    await client.query(
      `INSERT INTO run_steps (id,"runId",sequence,kind,title,status,"startedAt","pageId","pageUrl") VALUES ($1,$2,1,'action','click','passed',now(),'page-1','https://example.com')`,
      [stepId, runId],
    );
    await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
    expect((await client.query('SELECT trace FROM model_calls')).rows).toEqual([{ trace: null }]);
    expect((await client.query('SELECT "modelCallId","toolCallId" FROM run_steps')).rows).toEqual([
      { modelCallId: null, toolCallId: null },
    ]);
    await client.query(
      'UPDATE run_steps SET "modelCallId"=$1,"toolCallId"=\'tool-1\' WHERE id=$2',
      [callId, stepId],
    );
    await client.query('DELETE FROM model_calls WHERE id=$1', [callId]);
    expect((await client.query('SELECT "modelCallId" FROM run_steps')).rows).toEqual([
      { modelCallId: null },
    ]);
    await client.query('DELETE FROM test_runs WHERE id=$1', [runId]);
    expect((await client.query('SELECT id FROM run_steps')).rows).toEqual([]);
  } finally {
    await client.close();
  }
}, 30000);
