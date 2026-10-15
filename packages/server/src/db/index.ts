import { Pool } from 'pg';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';

const state = globalThis as typeof globalThis & { testdogPool?: Pool };

config({ path: '.env' });

export const pool = (state.testdogPool ??= new Pool({
  connectionString: process.env.DATABASE_URL,
}));
export const db = drizzle({ client: pool });
