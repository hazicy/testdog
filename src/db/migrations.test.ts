import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

it.each(['empty', 'populated', 'missing'])(
  'removes only empty legacy users tables (%s)',
  async (state) => {
    const client = new PGlite();

    try {
      const directory = join(process.cwd(), 'drizzle');
      const cleanup = '20261011111451_simplify_legacy_storage';
      const entries = (await readdir(directory)).filter((entry) => /^\d{14}_/.test(entry)).sort();

      for (const entry of entries.filter((entry) => entry < cleanup))
        await client.exec(await readFile(join(directory, entry, 'migration.sql'), 'utf8'));
      if (state === 'missing') await client.exec('DROP TABLE users');
      if (state === 'populated')
        await client.exec("INSERT INTO users (id,name) VALUES (1,'Legacy user')");
      await client.exec(await readFile(join(directory, cleanup, 'migration.sql'), 'utf8'));
      expect(
        (
          await client.query<{ exists: boolean }>(
            "SELECT to_regclass('public.users') IS NOT NULL AS exists",
          )
        ).rows[0].exists,
      ).toBe(state === 'populated');
      if (state === 'populated')
        expect((await client.query('SELECT * FROM users')).rows).toEqual([
          { id: 1, name: 'Legacy user' },
        ]);
    } finally {
      await client.close();
    }
  },
  30000,
);

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

it.each([false, true])(
  'preserves legacy records without assigning a user (legacy table omitted: %s)',
  async (missingLegacyTable) => {
    const client = new PGlite();
    const directory = join(process.cwd(), 'drizzle');
    const migrations = (await readdir(directory)).filter((entry) => /^\d{14}_/.test(entry)).sort();
    const isolation = '20261010144955';
    const key = randomUUID();
    const testId = randomUUID();
    const runId = randomUUID();

    try {
      for (const migration of migrations.filter((name) => name.slice(0, 14) < isolation))
        await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
      await client.query(
        "INSERT INTO test_cases (id,name,goal,url) VALUES ($1,'Legacy','Goal','https://example.com')",
        [testId],
      );
      await client.query(
        "INSERT INTO test_runs (id,\"testId\",name,goal,url,status) VALUES ($1,$2,'Legacy','Goal','https://example.com','queued')",
        [runId, testId],
      );
      await client.query(
        "INSERT INTO submission_requests (key,fingerprint,response) VALUES ($1,'legacy-fingerprint',$2)",
        [key, JSON.stringify({ run: { id: runId } })],
      );
      if (missingLegacyTable) await client.exec('DROP TABLE "case"');
      for (const migration of migrations.filter((name) => name.slice(0, 14) >= isolation))
        await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
      const reservation = (
        await client.query<{ id: string; key: string; userId: string | null; response: unknown }>(
          'SELECT * FROM submission_requests',
        )
      ).rows[0];

      expect(
        (
          await client.query<{ exists: boolean }>(
            "SELECT to_regclass('public.case') IS NOT NULL AS exists",
          )
        ).rows[0].exists,
      ).toBe(false);
      expect(reservation).toMatchObject({ key, userId: null, response: { run: { id: runId } } });
      expect(reservation.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(
        (await client.query('SELECT "userId" FROM test_cases WHERE id=$1', [testId])).rows[0],
      ).toEqual({ userId: null });
      expect(
        (await client.query('SELECT "userId" FROM test_runs WHERE id=$1', [runId])).rows[0],
      ).toEqual({ userId: null });
      await expect(
        client.query("INSERT INTO submission_requests (key,fingerprint) VALUES ($1,'duplicate')", [
          key,
        ]),
      ).rejects.toThrow();
    } finally {
      await client.close();
    }
  },
  30000,
);
