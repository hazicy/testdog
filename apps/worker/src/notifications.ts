import './environment';
import { pool } from '@testdog/server/db';
import { startNotificationDispatcher } from '@testdog/server/integrations/dispatcher';

const stop = startNotificationDispatcher();

await new Promise<void>((resolve) => {
  const keepAlive = setInterval(() => {}, 60000);
  const finish = () => {
    clearInterval(keepAlive);
    resolve();
  };

  process.once('SIGINT', finish);
  process.once('SIGTERM', finish);
});
await stop();
await pool.end();
