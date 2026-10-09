import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';

const connectString = process.env.DATABASE_URL;

if (!connectString) {
  throw new Error('数据库地址不存在');
}

export const db = drizzle(connectString);
