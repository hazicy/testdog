import 'dotenv/config';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('缺少 DATABASE_URL 环境变量');
}

export const db = new Pool({
  connectionString,
});
