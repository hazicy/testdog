import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

it('backfills existing desktop recordings and terminates only unfinished legacy workers', async () => {
  const client = new PGlite();
  const directory = join(process.cwd(), 'drizzle');
  const migrations = (await readdir(directory)).filter((entry) => /^\d{14}_/.test(entry)).sort();
  const cutoff = '20261009191437';
  const testId = randomUUID(),
    finishedId = randomUUID(),
    activeId = randomUUID(),
    stepId = randomUUID(),
    artifactId = randomUUID(),
    versionId = randomUUID();
  const action = {
    type: 'navigate',
    target: { kind: 'css', value: '', name: '' },
    value: 'https://example.com',
  };
  const code = 'await page1.goto("https://example.com");';

  try {
    for (const migration of migrations.filter((name) => name.slice(0, 14) < cutoff))
      await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
    await client.query('INSERT INTO test_cases (id, name, goal, url) VALUES ($1, $2, $3, $4)', [
      testId,
      'Legacy desktop',
      'Legacy goal',
      'https://example.com',
    ]);
    for (const [id, status] of [
      [finishedId, 'passed'],
      [activeId, 'running'],
    ])
      await client.query(
        'INSERT INTO test_runs (id, "testId", name, goal, url, status, "workerId", "startedAt", replayable) VALUES ($1,$2,$3,$4,$5,$6,$7,now() - interval \'2 minutes\',true)',
        [
          id,
          testId,
          'Legacy desktop',
          'Legacy goal',
          'https://example.com',
          status,
          'old-api-owner',
        ],
      );
    await client.query(
      "INSERT INTO run_steps (id,\"runId\",sequence,kind,title,status,\"startedAt\",\"pageId\",\"pageUrl\",action) VALUES ($1,$2,1,'navigate','Open','running',now() - interval '1 minute','page-1','https://example.com',$3)",
      [stepId, activeId, JSON.stringify(action)],
    );
    await client.query(
      'INSERT INTO run_artifacts (id,"runId",kind,stage,"pageId","pageUrl","capturedAt","elapsedMs",path,"contentType",size) VALUES ($1,$2,\'screenshot\',\'after\',\'page-1\',\'https://example.com\',now(),100,\'/legacy/frame.jpg\',\'image/jpeg\',42)',
      [artifactId, finishedId],
    );
    await client.query(
      'INSERT INTO recording_versions (id,"runId",code,steps) VALUES ($1,$2,$3,\'[]\')',
      [versionId, finishedId, code],
    );
    for (const migration of migrations.filter((name) => name.slice(0, 14) >= cutoff))
      await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
    const finished = (
      await client.query<{
        status: string;
        targetSnapshot: { deviceProfile: string };
        goal: string;
        replayable: boolean;
      }>('SELECT * FROM test_runs WHERE id=$1', [finishedId])
    ).rows[0];

    expect(finished).toMatchObject({
      status: 'passed',
      goal: 'Legacy goal',
      replayable: true,
      targetSnapshot: { platform: 'web', deviceProfile: 'legacy-desktop', browser: 'chromium' },
    });
    const active = (
      await client.query<{
        status: string;
        evidenceComplete: boolean;
        errorCode: string;
        durationMs: number;
      }>('SELECT * FROM test_runs WHERE id=$1', [activeId])
    ).rows[0];

    expect(active).toMatchObject({
      status: 'failed',
      evidenceComplete: false,
      errorCode: 'LEGACY_WORKER_STOPPED',
    });
    expect(active.durationMs).toBeGreaterThanOrEqual(120000);
    expect(
      (
        await client.query<{ status: string; action: unknown }>(
          'SELECT * FROM run_steps WHERE id=$1',
          [stepId],
        )
      ).rows[0],
    ).toMatchObject({ status: 'failed', action });
    expect(
      (
        await client.query<{ path: string }>('SELECT path FROM run_artifacts WHERE id=$1', [
          artifactId,
        ])
      ).rows[0].path,
    ).toBe('/legacy/frame.jpg');
    expect(
      (
        await client.query<{ code: string; targetSnapshot: unknown }>(
          'SELECT code,"targetSnapshot" FROM recording_versions WHERE id=$1',
          [versionId],
        )
      ).rows[0],
    ).toEqual({ code, targetSnapshot: finished.targetSnapshot });
  } finally {
    await client.close();
  }
}, 30000);
