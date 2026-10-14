import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/neon-serverless';

const state = globalThis as typeof globalThis & { caseforgePool?: Pool };

config({ path: '.env' });

export const pool = (state.caseforgePool ??= new Pool({
  connectionString: process.env.DATABASE_URL,
}));
export const db = drizzle({ client: pool });
