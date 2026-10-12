import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { recordingOperation } from '@testdog/contracts/runs/lib/recordingOperation';
import type { ExecutionStep, RecordingOperation } from '@testdog/contracts/runs/types';

const migration = '20261012144247_unify_recording_operations';

it('migrates execution records and frozen operations, including nested historical payloads', async () => {
  const client = new PGlite();
  const directory = join(process.cwd(), 'drizzle');
  const runId = randomUUID();
  const native = { schemaVersion: 1, platform: 'ios', action: { type: 'back' } };
  const legacyAction = {
    type: 'fill',
    target: { kind: 'testId', value: 'password', name: '' },
    value: '${secret:PASSWORD}',
    sensitive: true,
  };
  const mappings = {
    toBeVisible: 'visible',
    toHaveText: 'text',
    toContainText: 'containsText',
    toHaveValue: 'value',
    toHaveURL: 'url',
  };
  const fields: {
    action?: unknown;
    platformAction?: unknown;
    playwrightAssertion?: unknown;
    platformAssertion?: unknown;
    condition?: string;
    decision?: boolean;
  }[] = [
    { action: legacyAction },
    ...Object.keys(mappings).map((type) => ({
      playwrightAssertion: {
        type,
        target: type === 'toHaveURL' ? undefined : legacyAction.target,
        value: type === 'toBeVisible' ? undefined : 'expected',
        negate: true,
      },
    })),
    { platformAction: native, action: legacyAction },
    { action: { platform: 'web', action: legacyAction } },
    {
      platformAssertion: {
        platform: 'ios',
        type: 'text',
        target: { kind: 'label', value: 'Welcome' },
        value: 'Welcome',
      },
    },
    { condition: 'Already signed in', decision: false, action: null, playwrightAssertion: null },
    {
      platformAssertion: {
        platform: 'web',
        type: 'text',
        target: legacyAction.target,
        value: 'old',
      },
      playwrightAssertion: { type: 'toHaveText', target: legacyAction.target, value: 'expected' },
    },
  ];
  const steps = fields.map((field, index) => ({
    id: randomUUID(),
    runId,
    sequence: index + 1,
    kind: field.action || field.platformAction ? 'action' : 'assertion',
    title: `Step ${index}`,
    status: 'passed',
    startedAt: '2026-10-12T00:00:00Z',
    pageId: 'page-1',
    pageUrl: '',
    replayable: true,
    evidence: 'original evidence',
    ...field,
  }));

  try {
    for (const entry of (await readdir(directory)).filter((name) => /^\d{14}_/.test(name)).sort()) {
      if (entry >= migration) break;
      await client.exec(await readFile(join(directory, entry, 'migration.sql'), 'utf8'));
    }

    await client.query(
      `INSERT INTO test_runs (id,name,goal,status,"targetSnapshot","recordingSteps")
       VALUES ($1,'Historical','Check','passed',$2,$3)`,
      [
        runId,
        JSON.stringify({ schemaVersion: 1, platform: 'web', url: 'https://example.com' }),
        JSON.stringify(steps),
      ],
    );
    for (const step of steps) {
      await client.query(
        `INSERT INTO run_steps (id,"runId",sequence,kind,title,status,"startedAt","pageId","pageUrl",action,"platformAction","playwrightAssertion","platformAssertion",condition,decision,evidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          step.id,
          runId,
          step.sequence,
          step.kind,
          step.title,
          step.status,
          step.startedAt,
          step.pageId,
          step.pageUrl,
          JSON.stringify(step.action ?? null),
          JSON.stringify(step.platformAction ?? null),
          JSON.stringify(step.playwrightAssertion ?? null),
          JSON.stringify(step.platformAssertion ?? null),
          step.condition ?? null,
          step.decision ?? null,
          step.evidence,
        ],
      );
    }

    await client.query('INSERT INTO recording_versions ("runId",code,steps) VALUES ($1,$2,$3)', [
      runId,
      'original editor code',
      JSON.stringify(steps),
    ]);
    const issueId = randomUUID();

    await client.query('INSERT INTO issues (id,title) VALUES ($1,$2)', [
      issueId,
      'Historical issue',
    ]);
    await client.query(
      'INSERT INTO issue_occurrences ("issueId","runId",snapshot) VALUES ($1,$2,$3)',
      [issueId, runId, JSON.stringify({ step: steps[0], error: 'original error' })],
    );
    await client.query(
      'INSERT INTO submission_requests (key,fingerprint,response) VALUES ($1,$2,$3)',
      [
        randomUUID(),
        'fingerprint',
        JSON.stringify({
          run: { steps, recordingSteps: steps },
          runs: [{ recordingSteps: steps }],
        }),
      ],
    );
    await client.exec(await readFile(join(directory, migration, 'migration.sql'), 'utf8'));
    const executed = (
      await client.query<ExecutionStep>('SELECT * FROM run_steps ORDER BY sequence')
    ).rows;

    expect(executed[0].action).toEqual({ platform: 'web', action: legacyAction });
    Object.values(mappings).forEach((type, index) => {
      expect(executed[index + 1].platformAssertion).toMatchObject({
        platform: 'web',
        type,
        negate: true,
      });
    });
    expect(executed[6].action).toEqual(native);
    expect(executed[7].action).toEqual(executed[0].action);
    expect(executed[8].platformAssertion).toEqual(fields[8].platformAssertion);
    expect(executed[9].decision).toBe(false);
    expect(executed[10].platformAssertion?.value).toBe('expected');
    expect(executed.map((step) => step.id)).toEqual(steps.map((step) => step.id));
    expect(executed.every((step) => step.evidence === 'original evidence')).toBe(true);
    expect(executed[0]).not.toHaveProperty('platformAction');
    expect(executed[0]).not.toHaveProperty('playwrightAssertion');
    const snapshot = (
      await client.query<{ recordingSteps: RecordingOperation[] }>(
        'SELECT "recordingSteps" FROM test_runs',
      )
    ).rows[0].recordingSteps;
    const version = (
      await client.query<{ code: string; steps: RecordingOperation[] }>(
        'SELECT code,steps FROM recording_versions',
      )
    ).rows[0];

    expect(version.code).toBe('original editor code');
    expect(version.steps).toEqual(snapshot);
    snapshot.forEach((step, index) => {
      // Both projections omit execution metadata and keep the same replay inputs.
      expect(step).toEqual(
        Object.fromEntries(
          Object.entries(recordingOperation(executed[index])).filter(
            ([, value]) => value !== null && value !== undefined,
          ),
        ),
      );
      expect(step).not.toHaveProperty('runId');
      expect(step).not.toHaveProperty('startedAt');
      expect(step).not.toHaveProperty('evidence');
    });
    const occurrence = (
      await client.query<{ snapshot: { step: ExecutionStep; error: string } }>(
        'SELECT snapshot FROM issue_occurrences',
      )
    ).rows[0].snapshot;
    const cached = (
      await client.query<{
        response: {
          run: { steps: ExecutionStep[]; recordingSteps: RecordingOperation[] };
          runs: { recordingSteps: RecordingOperation[] }[];
        };
      }>('SELECT response FROM submission_requests')
    ).rows[0].response;

    expect(occurrence.step.action).toEqual(executed[0].action);
    expect(occurrence.error).toBe('original error');
    expect(cached.run.steps[0].action).toEqual(executed[0].action);
    expect(cached.run.recordingSteps).toEqual(snapshot);
    expect(cached.runs[0].recordingSteps).toEqual(snapshot);
    const events = (
      await client.query<{ data: ExecutionStep }>(
        "SELECT data FROM realtime_outbox WHERE kind='step' ORDER BY id",
      )
    ).rows;

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].data.action).toEqual(executed[0].action);
    expect(JSON.stringify(events)).not.toContain('playwrightAssertion');
    expect(JSON.stringify(events)).not.toContain('platformAction');
  } finally {
    await client.close();
  }
});
