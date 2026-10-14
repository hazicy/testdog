import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createTestDatabase } from '@testdog/server/testing/testDatabase';

it('removes input definitions from cases, runs, recordings, issues and submission responses', async () => {
  const { client } = await createTestDatabase();
  const caseId = randomUUID();
  const runId = randomUUID();
  const issueId = randomUUID();
  const target = {
    schemaVersion: 1,
    platform: 'web',
    url: 'https://example.com',
    browser: 'chromium',
    deviceProfile: 'Pixel 7',
  };
  const legacyTarget = { ...target, inputs: { name: { value: 'Ada' } } };
  const snapshot = {
    target: legacyTarget,
    name: 'Failure',
    environment: { browserVersion: '123' },
  };
  const response = { run: { id: runId, targetSnapshot: legacyTarget, status: 'passed' } };

  try {
    await client.query('INSERT INTO test_cases (id,name,goal,target) VALUES ($1,$2,$3,$4)', [
      caseId,
      'Case',
      'Check',
      JSON.stringify(legacyTarget),
    ]);
    await client.query(
      'INSERT INTO test_runs (id,name,goal,status,"targetSnapshot") VALUES ($1,$2,$3,$4,$5)',
      [runId, 'Run', 'Check', 'passed', JSON.stringify(legacyTarget)],
    );
    await client.query(
      'INSERT INTO recording_versions ("runId",code,steps,"targetSnapshot") VALUES ($1,$2,$3,$4)',
      [runId, '', '[]', JSON.stringify(legacyTarget)],
    );
    await client.query('INSERT INTO issues (id,title) VALUES ($1,$2)', [issueId, 'Failure']);
    await client.query(
      'INSERT INTO issue_occurrences ("issueId","runId",snapshot) VALUES ($1,$2,$3)',
      [issueId, runId, JSON.stringify(snapshot)],
    );
    await client.query(
      'INSERT INTO submission_requests (key,fingerprint,response) VALUES ($1,$2,$3)',
      [randomUUID(), 'fingerprint', JSON.stringify(response)],
    );
    const migration = await readFile(
      join(process.cwd(), 'drizzle/20261014000000_remove_input_references/migration.sql'),
      'utf8',
    );

    // Running cleanup twice also covers already clean records.
    await client.exec(migration);
    await client.exec(migration);
    expect((await client.query('SELECT target FROM test_cases')).rows).toEqual([{ target }]);
    for (const table of ['test_runs', 'recording_versions'])
      expect((await client.query(`SELECT "targetSnapshot" FROM "${table}"`)).rows).toEqual([
        { targetSnapshot: target },
      ]);
    expect((await client.query('SELECT snapshot FROM issue_occurrences')).rows).toEqual([
      { snapshot: { ...snapshot, target } },
    ]);
    expect((await client.query('SELECT response FROM submission_requests')).rows).toEqual([
      { response: { run: { ...response.run, targetSnapshot: target } } },
    ]);
  } finally {
    await client.close();
  }
}, 30000);
