import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const migration = '20261012134108_remove_legacy_urls_and_replay_fallback';
const directory = join(process.cwd(), 'drizzle');

async function beforeMigration(client: PGlite) {
  for (const entry of (await readdir(directory)).filter((name) => /^\d{14}_/.test(name)).sort()) {
    if (entry >= migration) break;
    await client.exec(await readFile(join(directory, entry, 'migration.sql'), 'utf8'));
  }
}

it('preserves canonical targets and freezes legacy replays before removing URL columns', async () => {
  const client = new PGlite();
  const caseId = randomUUID();
  const sourceId = randomUUID();
  const replayId = randomUUID();
  const editedReplayId = randomUUID();
  const frozenId = randomUUID();
  const nativeId = randomUUID();
  const versionId = randomUUID();
  const steps = [2, 1].map((sequence) => ({
    id: randomUUID(),
    runId: sourceId,
    sequence,
    kind: 'navigate',
    title: `Step ${sequence}`,
    status: 'passed',
    startedAt: '2026-10-12T00:00:00Z',
    pageId: 'page',
    pageUrl: 'https://example.com',
    replayable: true,
    action: { type: 'navigate', value: `https://example.com/${sequence}` },
  }));
  const editedSteps = [{ ...steps[0], title: 'Edited recording' }];
  const frozenSteps = [{ ...steps[1], title: 'Already frozen' }];
  const plan = { rootId: 'node', nodes: { node: { id: 'node', kind: 'task', goal: 'Check' } } };
  const nativeTarget = {
    schemaVersion: 1,
    platform: 'ios',
    appId: 'com.example.app',
    deviceProfileId: 'phone',
    resetPolicy: 'preserve',
  };

  try {
    await beforeMigration(client);
    await client.query(
      "INSERT INTO test_cases (id,name,goal,url) VALUES ($1,'Legacy','Check','https://example.com')",
      [caseId],
    );
    await client.query(
      `INSERT INTO test_runs (id,"testId",name,goal,url,status,plan,"environmentSnapshot")
       VALUES ($1,$2,'Source','Check','https://example.com','passed',$3,'{"viewport":{"width":1280,"height":800}}')`,
      [sourceId, caseId, JSON.stringify(plan)],
    );
    for (const step of steps) {
      await client.query(
        `INSERT INTO run_steps (id,"runId",sequence,kind,title,status,"startedAt","pageId","pageUrl",action)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          step.id,
          step.runId,
          step.sequence,
          step.kind,
          step.title,
          step.status,
          step.startedAt,
          step.pageId,
          step.pageUrl,
          JSON.stringify(step.action),
        ],
      );
    }

    await client.query(
      'INSERT INTO recording_versions (id,"runId",code,steps) VALUES ($1,$2,$3,$4)',
      [versionId, sourceId, 'edited code', JSON.stringify(editedSteps)],
    );
    for (const [id, selectedVersion] of [
      [replayId, null],
      [editedReplayId, versionId],
    ]) {
      await client.query(
        `INSERT INTO test_runs (id,name,goal,url,status,mode,"sourceRunId","recordingVersionId")
         VALUES ($1,'Replay','Check','https://example.com','queued','replay',$2,$3)`,
        [id, sourceId, selectedVersion],
      );
    }

    await client.query(
      `INSERT INTO test_runs (id,name,goal,url,status,mode,"sourceRunId","recordingSteps",plan,"replayEnvironmentSnapshot")
       VALUES ($1,'Frozen','Check','https://example.com','queued','replay',$2,$3,'{"rootId":"frozen","nodes":{}}','{"frozen":true}')`,
      [frozenId, sourceId, JSON.stringify(frozenSteps)],
    );
    await client.query(
      `INSERT INTO test_runs (id,name,goal,url,status,"targetSnapshot") VALUES ($1,'Native','Check','https://stale.example.com','passed',$2)`,
      [nativeId, JSON.stringify(nativeTarget)],
    );
    await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
    const target = {
      schemaVersion: 1,
      platform: 'web',
      url: 'https://example.com',
      browser: 'chromium',
      deviceProfile: 'legacy-desktop',
    };

    expect((await client.query('SELECT target FROM test_cases')).rows).toEqual([{ target }]);
    expect(
      (await client.query('SELECT "targetSnapshot" FROM test_runs WHERE id=$1', [nativeId])).rows,
    ).toEqual([{ targetSnapshot: nativeTarget }]);
    const replay = (
      await client.query<{
        recordingSteps: typeof steps;
        plan: unknown;
        replayEnvironmentSnapshot: unknown;
      }>('SELECT * FROM test_runs WHERE id=$1', [replayId])
    ).rows[0];

    expect(replay.recordingSteps.map((step) => step.sequence)).toEqual([1, 2]);
    expect(replay.recordingSteps.map((step) => step.action)).toEqual([
      steps[1].action,
      steps[0].action,
    ]);
    expect(replay.plan).toEqual(plan);
    expect(replay.replayEnvironmentSnapshot).toEqual({ viewport: { width: 1280, height: 800 } });
    expect(
      (await client.query('SELECT "recordingSteps" FROM test_runs WHERE id=$1', [editedReplayId]))
        .rows,
    ).toEqual([{ recordingSteps: editedSteps }]);
    expect(
      (
        await client.query(
          'SELECT "recordingSteps",plan,"replayEnvironmentSnapshot" FROM test_runs WHERE id=$1',
          [frozenId],
        )
      ).rows,
    ).toEqual([
      {
        recordingSteps: frozenSteps,
        plan: { rootId: 'frozen', nodes: {} },
        replayEnvironmentSnapshot: { frozen: true },
      },
    ]);
    expect(
      (
        await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name IN ('test_cases','test_runs') AND column_name='url'`,
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await client.query(
          `SELECT id FROM realtime_outbox WHERE kind='run' AND (data->'targetSnapshot' IS NULL OR data->'targetSnapshot'='null'::jsonb OR data ? 'url')`,
        )
      ).rows,
    ).toEqual([]);
    await client.query('DELETE FROM test_runs WHERE id=$1', [sourceId]);
    expect(
      (
        await client.query(
          'SELECT "sourceRunId","recordingVersionId","recordingSteps" FROM test_runs WHERE id=$1',
          [editedReplayId],
        )
      ).rows,
    ).toEqual([{ sourceRunId: null, recordingVersionId: null, recordingSteps: editedSteps }]);
  } finally {
    await client.close();
  }
}, 30000);

it('rejects cutover when a runnable legacy replay has no reconstructable source', async () => {
  const client = new PGlite();

  try {
    await beforeMigration(client);
    await client.exec(
      `INSERT INTO test_runs (name,goal,url,status,mode) VALUES ('Missing source','Check','https://example.com','queued','replay')`,
    );
    await expect(
      client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8')),
    ).rejects.toThrow('Active legacy replay is missing its source snapshot');
    expect((await client.query('SELECT url,status FROM test_runs')).rows).toEqual([
      { url: 'https://example.com', status: 'queued' },
    ]);
  } finally {
    await client.close();
  }
}, 30000);
