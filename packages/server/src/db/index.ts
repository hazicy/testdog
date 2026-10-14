import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const state = globalThis as typeof globalThis & { caseforgePool?: pg.Pool };

export const pool = (state.caseforgePool ??= new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  max: 2,
  idleTimeoutMillis: 10_000, // 空闲连接尽快归还，减少被掐概率
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
}));
export const db = drizzle({ client: pool });
