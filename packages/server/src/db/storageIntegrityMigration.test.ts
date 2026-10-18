import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';

const client = new PGlite();
const migration = '20261018133124_strengthen_storage_integrity';
const runId = '00000000-0000-4000-8000-000000000001';
const stepId = '00000000-0000-4000-8000-000000000002';
const callId = '00000000-0000-4000-8000-000000000003';
const tables = [
  'test_runs',
  'run_steps',
  'model_calls',
  'recording_versions',
  'automation_resources',
  'automation_builds',
  'issue_events',
  'notification_deliveries',
];
let before: unknown[];

async function rows() {
  return Promise.all(
    tables.map(async (table) => (await client.query(`SELECT * FROM ${table}`)).rows),
  );
}

beforeAll(async () => {
  const directory = join(process.cwd(), 'drizzle');

  for (const name of (await readdir(directory)).filter((name) => /^\d{14}_/.test(name)).sort()) {
    if (name >= migration) break;
    await client.exec(await readFile(join(directory, name, 'migration.sql'), 'utf8'));
  }

  await client.query(
    `INSERT INTO test_runs (id,name,goal,status,"targetSnapshot")
     VALUES ($1,'Run','Check','passed','{"schemaVersion":1,"platform":"web","url":"https://example.com"}')`,
    [runId],
  );
  await client.query(
    `INSERT INTO model_calls (id,"runId","startedAt","durationMs",model,status,"retryCount","failedAttempts")
     VALUES ($1,$2,now(),0,'fixture','passed',0,0)`,
    [callId, runId],
  );
  await client.query(
    `INSERT INTO run_steps (id,"runId","modelCallId",sequence,kind,title,status,"startedAt","pageId","pageUrl")
     VALUES ($1,$2,$3,1,'action','Click','passed',now(),'page-1','https://example.com')`,
    [stepId, runId, callId],
  );
  await client.query(
    `INSERT INTO recording_versions ("runId",code,steps) VALUES ($1,'recording','[]')`,
    [runId],
  );
  await client.exec(`
    INSERT INTO automation_resources (id,"hostId",platform,"profileId") VALUES ('slot','host','web','mobile');
    INSERT INTO automation_builds (platform,"appId",sha256,path) VALUES ('ios','app','hash','/build');
    WITH issue AS (INSERT INTO issues (title) VALUES ('Failure') RETURNING id)
      INSERT INTO issue_events ("issueId",kind,message) SELECT id,'created','Created' FROM issue;
    WITH integration AS (
      INSERT INTO notification_integrations (channel,"encryptedConfig") VALUES ('email','fixture') RETURNING id
    ), event AS (
      INSERT INTO notification_events ("sourceKey","eventType",payload) VALUES ('fixture','test','{}') RETURNING id
    )
      INSERT INTO notification_deliveries ("integrationId","integrationVersion","eventId")
      SELECT integration.id,1,event.id FROM integration,event;
  `);
  before = await rows();
  await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
}, 30000);

afterAll(async () => {
  await client.close();
});

it('preserves existing records, zero metrics and nullable historical values', async () => {
  expect(await rows()).toEqual(before);
});

it.each([
  ['automation_builds', 'platform', "'web'"],
  ['automation_resources', 'platform', "'unknown'"],
  ['recording_versions', 'platform', "'unknown'"],
  ['recording_versions', 'schemaVersion', '0'],
  ['issue_events', 'kind', "'unknown'"],
  ['model_calls', 'status', "'unknown'"],
  ['model_calls', 'durationMs', '-1'],
  ['model_calls', 'retryCount', '-1'],
  ['model_calls', 'failedAttempts', '-1'],
  ['model_calls', 'inputTokens', '-1'],
  ['model_calls', 'outputTokens', '-1'],
  ['notification_deliveries', 'attempts', '-1'],
  ['run_steps', 'durationMs', '-1'],
])('rejects invalid %s.%s values at the database boundary', async (table, column, value) => {
  await expect(client.exec(`UPDATE ${table} SET "${column}" = ${value}`)).rejects.toMatchObject({
    code: '23514',
  });
});

it('indexes reverse references used for evidence, replay and notification lookups', async () => {
  const expected = [
    'issue_occurrences_run_step_idx',
    'issue_occurrences_step_idx',
    'issue_verifications_occurrence_idx',
    'notification_deliveries_event_id_idx',
    'run_artifacts_step_idx',
    'run_steps_model_call_idx',
    'test_runs_source_idx',
    'test_runs_recording_version_idx',
  ];
  const result = await client.query<{ indexname: string }>(
    'SELECT indexname FROM pg_indexes WHERE indexname = ANY($1::text[]) ORDER BY indexname',
    [expected],
  );

  expect(result.rows.map((row) => row.indexname)).toEqual(expected.sort());
});

it('keeps nullable links when a referenced model call is removed', async () => {
  await client.query('DELETE FROM model_calls WHERE id = $1', [callId]);

  expect(
    (await client.query('SELECT "modelCallId" FROM run_steps WHERE id = $1', [stepId])).rows,
  ).toEqual([{ modelCallId: null }]);
});
