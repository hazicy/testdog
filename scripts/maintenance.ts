import { startNotificationDispatcher } from '../src/server/integrations/dispatcher';
import 'dotenv/config';
import { pool } from '../src/db';
import { startLeaseMaintenance } from '../src/server/scheduling/maintenance';

const stop = startLeaseMaintenance();
const stopNotifications = startNotificationDispatcher();

await new Promise<void>((resolve) => {
  process.once('SIGINT', resolve);
  process.once('SIGTERM', resolve);
  // Keep this dedicated service alive even when no workers are running.
  const keepAlive = setInterval(() => {}, 60000);

  process.once('SIGINT', () => clearInterval(keepAlive));
  process.once('SIGTERM', () => clearInterval(keepAlive));
});
await stopNotifications();
await stop();
await pool.end();
