import { join } from 'node:path';

export const artifactRoot = () =>
  join(process.env.CASEFORGE_DATA_DIR || join(process.cwd(), '.automation'), 'artifacts');
