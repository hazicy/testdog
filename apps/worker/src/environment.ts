import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

const workspaceRoot = resolve(process.cwd(), '../..');
const runtimeRoot = existsSync(resolve(workspaceRoot, 'pnpm-workspace.yaml'))
  ? workspaceRoot
  : process.cwd();

loadDotenv({ path: [resolve(process.cwd(), '.env'), resolve(runtimeRoot, '.env')] });
process.env.CASEFORGE_DATA_DIR ||= resolve(runtimeRoot, '.automation');
