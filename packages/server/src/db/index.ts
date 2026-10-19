import { Pool } from 'pg';
import { poolConfig } from './poolConfig';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';

const state = globalThis as typeof globalThis & { testdogPool?: Pool };

config({ path: '.env' });

export const pool = (state.testdogPool ??= new Pool(poolConfig()));
export const db = drizzle({ client: pool });
