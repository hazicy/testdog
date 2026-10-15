import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it.each(['testdog_', 'legacy_'])(
  'preserves realtime and notification triggers when upgrading %s database objects',
  async (prefix) => {
    const client = new PGlite();
    const directory = join(process.cwd(), 'drizzle');
    const migration = '20261015131745_rename_testdog_database_objects';

    try {
      for (const name of (await readdir(directory))
        .filter((entry) => /^\d{14}_/.test(entry) && entry < migration)
        .sort()) {
        const sql = await readFile(join(directory, name, 'migration.sql'), 'utf8');

        await client.exec(sql.replaceAll('testdog_', prefix));
      }

      await client.exec(
        'CREATE FUNCTION unrelated_notify_run() RETURNS void LANGUAGE sql AS $$ SELECT $$',
      );
      const sql = await readFile(join(directory, migration, 'migration.sql'), 'utf8');

      await client.exec(sql);
      await client.exec(sql);

      const functions = await client.query<{ name: string; definition: string }>(`
        SELECT p.proname AS name, pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND (p.proname LIKE 'testdog_%' OR p.proname LIKE 'legacy_%')
      `);

      expect(functions.rows).toHaveLength(5);
      for (const fn of functions.rows) {
        expect(fn.name).toMatch(/^testdog_/);
        expect(fn.definition).not.toContain('legacy_');
      }

      expect(
        (await client.query("SELECT to_regproc('unrelated_notify_run') AS name")).rows[0],
      ).toEqual({
        name: 'unrelated_notify_run',
      });
      const triggers = await client.query<{ name: string }>(`
        SELECT tgname AS name FROM pg_trigger
        WHERE NOT tgisinternal AND tgname ~ '^(testdog|legacy)_'
      `);

      expect(triggers.rows.length).toBeGreaterThan(0);
      for (const trigger of triggers.rows) expect(trigger.name).toMatch(/^testdog_/);

      await client.exec(`
        INSERT INTO notification_integrations (id,channel,enabled,events,"encryptedConfig")
          VALUES (gen_random_uuid(),'feishu',true,'["run.failed","issue.created"]','fixture');
        INSERT INTO test_runs (name,goal,status,"targetSnapshot")
          VALUES ('Run','Check','queued','{"schemaVersion":1,"platform":"web","url":"https://example.com","browser":"chromium","deviceProfile":"Pixel 7"}');
        UPDATE test_runs SET status='failed';
        INSERT INTO issues (title) VALUES ('Issue');
      `);
      expect((await client.query('SELECT "realtimeRevision" FROM test_runs')).rows).toEqual([
        { realtimeRevision: 2 },
      ]);
      expect(
        (await client.query("SELECT kind FROM realtime_outbox WHERE kind='run'")).rows,
      ).toHaveLength(2);
      expect((await client.query('SELECT id FROM notification_events')).rows).toHaveLength(2);
      expect((await client.query('SELECT id FROM notification_deliveries')).rows).toHaveLength(2);
    } finally {
      await client.close();
    }
  },
  30000,
);
