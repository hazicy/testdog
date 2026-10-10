import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
// Isolated PostgreSQL engine: integration tests never connect to .env's database.
export async function createTestDatabase() {
  const client = new PGlite();
  const directory = join(process.cwd(), 'drizzle');
  for (const entry of (await readdir(directory)).sort()) {
    if (/^\d{14}_/.test(entry))
      await client.exec(await readFile(join(directory, entry, 'migration.sql'), 'utf8'));
  }
  return { client, db: drizzle({ client }) };
}
