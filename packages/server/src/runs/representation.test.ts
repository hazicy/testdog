import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';

const isolated = vi.hoisted(() => ({
  client: undefined as import('@electric-sql/pglite').PGlite | undefined,
  queries: [] as string[],
}));

vi.mock('@testdog/server/db', async () => {
  const { createTestDatabase } = await import('@testdog/server/testing/testDatabase');
  const result = await createTestDatabase();

  isolated.client = result.client;
  const { drizzle } = await import('drizzle-orm/pglite');

  return {
    db: drizzle({
      client: result.client,
      logger: {
        logQuery(sql) {
          isolated.queries.push(sql);
        },
      },
    }),
  };
});
import { createRun } from './submission';
import { getRunRepresentation } from './repository';
import { jsonResponse } from '@testdog/server/shared/jsonResponse';

afterAll(() => isolated.client!.close());

it('validates scope and returns 304 without reading detail tables or serializing the body', async () => {
  const run = await createRun({ case: 'Check', url: 'https://example.com' }, undefined, null);
  const initial = await getRunRepresentation(run.id, null, null);

  isolated.queries.length = 0;

  try {
    const cached = await getRunRepresentation(run.id, null, `"other", ${initial.etag}`);

    expect(cached.run).toBeUndefined();
    const statements = isolated.queries.join('\n');

    expect(statements).toContain('run_detail_versions');
    expect(statements).not.toMatch(/run_steps|run_artifacts|automation_run_events/);
    const response = jsonResponse(
      new Request('http://localhost', { headers: { 'If-None-Match': cached.etag } }),
      {
        toJSON() {
          throw new Error('Must not serialize');
        },
      },
      cached.etag,
    );

    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
    await expect(getRunRepresentation(run.id, 'another-user', initial.etag)).rejects.toMatchObject({
      status: 404,
    });
  } finally {
    isolated.queries.length = 0;
  }
});

it('invalidates updates and deletions of every detail collection while ignoring lease heartbeats', async () => {
  const run = await createRun({ case: 'Check', url: 'https://example.com' }, undefined, null);
  let previous = await getRunRepresentation(run.id, null, null);
  const step = randomUUID();
  const artifact = randomUUID();
  const event = randomUUID();
  const statements: [string, unknown[]][] = [
    ['UPDATE test_runs SET name=$2 WHERE id=$1', [run.id, 'Changed']],
    [
      `INSERT INTO run_steps (id,"runId",sequence,kind,title,status,"startedAt","pageId","pageUrl") VALUES ($1,$2,1,'action','Click','passed',now(),'page','')`,
      [step, run.id],
    ],
    ['UPDATE run_steps SET title=$2 WHERE id=$1', [step, 'Changed step']],
    ['DELETE FROM run_steps WHERE id=$1', [step]],
    [
      `INSERT INTO run_artifacts (id,"runId",kind,stage,"pageId","pageUrl","capturedAt","elapsedMs","contentType",path,size) VALUES ($1,$2,'screenshot','after','page','',now(),0,'image/png','fixture',0)`,
      [artifact, run.id],
    ],
    ['UPDATE run_artifacts SET "elapsedMs"=10 WHERE id=$1', [artifact]],
    ['DELETE FROM run_artifacts WHERE id=$1', [artifact]],
    [
      `INSERT INTO automation_run_events (id,"runId",attempt,sequence,at,message) VALUES ($1,$2,1,1,now(),'First')`,
      [event, run.id],
    ],
    ['UPDATE automation_run_events SET message=$2 WHERE id=$1', [event, 'Changed event']],
    ['DELETE FROM automation_run_events WHERE id=$1', [event]],
  ];

  for (const [sql, values] of statements) {
    await isolated.client!.query(sql, values);
    const next = await getRunRepresentation(run.id, null, previous.etag);

    expect(next.run, sql).toBeDefined();
    expect(next.etag, sql).not.toBe(previous.etag);
    previous = next;
  }

  await isolated.client!.query(
    `UPDATE test_runs SET "leaseUntil"=now()+interval '1 minute' WHERE id=$1`,
    [run.id],
  );
  expect((await getRunRepresentation(run.id, null, previous.etag)).run).toBeUndefined();
});
