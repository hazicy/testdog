import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('removes login identity storage and references while preserving cases and ordinary runs', async () => {
  const client = new PGlite();
  const directory = join(process.cwd(), 'drizzle');
  const migration = '20261013151838_chubby_morgan_stark';
  const caseId = randomUUID();
  const identityId = randomUUID();
  const runId = randomUUID();
  const verificationId = randomUUID();
  const target = {
    schemaVersion: 1,
    platform: 'web',
    url: 'https://example.com',
    browser: 'chromium',
    deviceProfile: 'legacy-desktop',
    loginIdentityId: identityId,
    inputs: { username: { value: 'Ada' } },
  };
  const environment = { browserVersion: '123', loginPreparation: { identityId } };

  try {
    for (const entry of (await readdir(directory)).filter((name) => /^\d{14}_/.test(name)).sort()) {
      if (entry >= migration) break;
      await client.exec(await readFile(join(directory, entry, 'migration.sql'), 'utf8'));
    }

    await client.query('INSERT INTO test_cases (id,name,goal,target) VALUES ($1,$2,$3,$4)', [
      caseId,
      'Case',
      'Check',
      JSON.stringify(target),
    ]);
    await client.query(
      'INSERT INTO login_identities (id,name,website,"loginTestId","checkUrl","successText","encryptedCredentials") VALUES ($1,$2,$3,$4,$3,$5,$6)',
      [identityId, 'Identity', target.url, caseId, 'Welcome', 'encrypted-password'],
    );
    await client.query(
      'INSERT INTO login_state_caches (key,"identityId","encryptedState") VALUES ($1,$2,$3)',
      ['cache', identityId, 'encrypted-session'],
    );
    for (const [id, verification] of [
      [runId, false],
      [verificationId, true],
    ] as const)
      await client.query(
        'INSERT INTO test_runs (id,name,goal,status,"targetSnapshot","environmentSnapshot","replayEnvironmentSnapshot","authenticationVerification") VALUES ($1,$2,$3,$4,$5,$6,$6,$7)',
        [
          id,
          'Run',
          'Check',
          'queued',
          JSON.stringify(target),
          JSON.stringify(environment),
          verification,
        ],
      );
    await client.query(
      'INSERT INTO recording_versions ("runId",code,steps,"targetSnapshot") VALUES ($1,$2,$3,$4)',
      [runId, '', '[]', JSON.stringify(target)],
    );
    await client.query(
      'INSERT INTO submission_requests (key,fingerprint,response) VALUES ($1,$2,$3)',
      [
        randomUUID(),
        'fingerprint',
        JSON.stringify({
          run: { id: runId, targetSnapshot: target, authenticationVerification: false },
        }),
      ],
    );

    await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
    const { loginIdentityId, ...cleanTarget } = target;

    void loginIdentityId;
    expect((await client.query('SELECT target FROM test_cases')).rows).toEqual([
      { target: cleanTarget },
    ]);
    expect((await client.query('SELECT "targetSnapshot" FROM recording_versions')).rows).toEqual([
      { targetSnapshot: cleanTarget },
    ]);
    const runs = (await client.query<Record<string, unknown>>('SELECT * FROM test_runs')).rows;

    expect(runs.find((run) => run.id === runId)).toMatchObject({
      status: 'queued',
      targetSnapshot: cleanTarget,
      environmentSnapshot: { browserVersion: '123' },
      replayEnvironmentSnapshot: { browserVersion: '123' },
    });
    expect(runs.find((run) => run.id === verificationId)).toMatchObject({
      status: 'cancelled',
      cancelRequested: true,
      errorCode: 'CANCELLED',
      fencingToken: 1,
    });
    expect(runs.every((run) => !Object.hasOwn(run, 'authenticationVerification'))).toBe(true);
    expect((await client.query('SELECT response FROM submission_requests')).rows).toEqual([
      { response: { run: { id: runId, targetSnapshot: cleanTarget } } },
    ]);
    expect(
      (
        await client.query(
          "SELECT to_regclass('login_identities') AS identities, to_regclass('login_state_caches') AS caches",
        )
      ).rows,
    ).toEqual([{ identities: null, caches: null }]);
    // Removing the identity table also removes the former login-flow deletion restriction.
    await client.query('DELETE FROM test_cases WHERE id=$1', [caseId]);
    expect((await client.query('SELECT * FROM test_cases')).rows).toHaveLength(0);
  } finally {
    await client.close();
  }
}, 30000);
