import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';

const original = '20261017092754_wandering_sister_grimm';
const directory = join(process.cwd(), 'drizzle');

test('preserves the name and exact SQL of the already applied team migration', async () => {
  const source = await readFile(join(directory, original, 'migration.sql'), 'utf8');

  expect(createHash('sha256').update(source).digest('hex')).toBe(
    '2901e90bfab0585c4704fbd0b8525cae07aeb4988f2f16e08949fee9bcbfce2e',
  );
});

test('upgrades original team object names and creates the folder tables without losing data', async () => {
  const client = new PGlite();

  try {
    for (const name of (await readdir(directory)).filter((name) => /^\d{14}_/.test(name)).sort()) {
      await client.exec(await readFile(join(directory, name, 'migration.sql'), 'utf8'));
      if (name === original) {
        await client.exec("INSERT INTO teams (name) VALUES ('Existing team')");
      }
    }

    expect((await client.query('SELECT name FROM teams')).rows).toEqual([
      { name: 'Existing team' },
    ]);
    expect(
      (
        await client.query(
          "SELECT indexname FROM pg_indexes WHERE indexname = 'test_cases_team_updated_idx'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await client.query(
          "SELECT conname FROM pg_constraint WHERE conname = 'test_cases_ownership_check'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await client.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'test_suites' AND column_name IN ('parentId','position')",
        )
      ).rows,
    ).toHaveLength(2);
  } finally {
    await client.close();
  }
}, 30000);
