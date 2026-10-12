import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it.each([false, true])(
  'preserves historical events, order, attempts and timestamps (conflicting message: %s)',
  async (conflict) => {
    const client = new PGlite();

    try {
      const directory = join(process.cwd(), 'drizzle');
      const migration = '20261011111932_normalize_run_events';
      const entries = (await readdir(directory)).filter((entry) => /^\d{14}_/.test(entry)).sort();

      for (const entry of entries.filter((entry) => entry < migration))
        await client.exec(await readFile(join(directory, entry, 'migration.sql'), 'utf8'));
      const runId = randomUUID();
      const eventId = randomUUID();
      const events = [
        { at: '2026-10-11T00:00:00.123Z', message: 'First attempt' },
        { at: '2026-10-11T00:00:01.456Z', message: 'Retry' },
        { at: '2026-10-11T00:00:02.789Z', message: 'JSON only' },
      ];

      await client.query(
        `INSERT INTO test_runs (id,name,url,goal,status,attempt,events) VALUES ($1,'History','','Check','passed',2,$2)`,
        [runId, JSON.stringify(events)],
      );
      await client.query(
        'INSERT INTO automation_run_events (id,"runId",attempt,sequence,at,message) VALUES ($1,$2,1,1,$3,$4)',
        [eventId, runId, '2026-10-11T00:00:00Z', conflict ? 'Conflicting' : events[0].message],
      );
      await client.query(
        'INSERT INTO automation_run_events ("runId",attempt,sequence,at,message) VALUES ($1,2,2,$2,$3),($1,2,4,$2,$4)',
        [runId, events[1].at, events[1].message, 'Table only'],
      );
      const migrationSql = await readFile(join(directory, migration, 'migration.sql'), 'utf8');

      if (conflict) {
        await expect(client.exec(migrationSql)).rejects.toThrow('Legacy run events conflict');
        expect(
          (await client.query('SELECT events FROM test_runs WHERE id=$1', [runId])).rows,
        ).toEqual([{ events }]);

        return;
      }

      await client.exec(migrationSql);
      const result = await client.query<{
        id: string;
        sequence: number;
        attempt: number;
        at: Date;
        message: string;
      }>('SELECT * FROM automation_run_events WHERE "runId"=$1 ORDER BY sequence', [runId]);

      expect(result.rows[0].id).toBe(eventId);
      expect(
        result.rows.map(({ sequence, attempt, at, message }) => ({
          sequence,
          attempt,
          at: new Date(at).toISOString(),
          message,
        })),
      ).toEqual([
        { sequence: 1, attempt: 1, ...events[0] },
        { sequence: 2, attempt: 2, ...events[1] },
        { sequence: 3, attempt: 2, ...events[2] },
        { sequence: 4, attempt: 2, at: events[1].at, message: 'Table only' },
      ]);
      expect(
        (
          await client.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name='test_runs' AND column_name='events'`,
          )
        ).rows,
      ).toEqual([]);
      await expect(
        client.query(
          'INSERT INTO automation_run_events ("runId",attempt,sequence,message) VALUES ($1,3,1,$2)',
          [runId, 'Duplicate sequence across attempts'],
        ),
      ).rejects.toThrow();
      await client.query('DELETE FROM test_runs WHERE id=$1', [runId]);
      expect((await client.query('SELECT * FROM automation_run_events')).rows).toEqual([]);
    } finally {
      await client.close();
    }
  },
  30000,
);
