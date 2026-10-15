import './environment';
import { hostname } from 'node:os';
import { recoverLocalResource } from '@testdog/server/scheduling/resourceRecovery';
import { pool } from '@testdog/server/db';

const id = process.argv[2];

if (!id) throw new Error('Usage: pnpm recover:resource <resource-id> (run on the resource host)');
try {
  const resource = await recoverLocalResource(id, process.env.TESTDOG_HOST_ID || hostname());

  if (!resource) throw new Error('Resource changed during recovery; it remains quarantined');
  process.stdout.write(`Resource ${resource.id} recovered after owner and health checks\n`);
} finally {
  await pool.end();
}
