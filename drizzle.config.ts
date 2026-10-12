import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/server/src/db/schema.ts',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
