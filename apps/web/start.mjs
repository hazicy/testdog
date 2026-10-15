import { cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

const workspaceRoot = resolve(process.cwd(), '../..');

if (existsSync(resolve(workspaceRoot, 'pnpm-workspace.yaml'))) {
  loadDotenv({ path: [resolve(process.cwd(), '.env'), resolve(workspaceRoot, '.env')] });
  process.env.TESTDOG_DATA_DIR ||= resolve(workspaceRoot, '.automation');
}

await cp('public', '.next/standalone/apps/web/public', { recursive: true });
await cp('.next/static', '.next/standalone/apps/web/.next/static', { recursive: true });
await import('./.next/standalone/apps/web/server.js');
