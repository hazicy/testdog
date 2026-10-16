import { logger } from '@testdog/server/shared/logger';
import { recoverLeases } from '@testdog/server/scheduling/scheduler';

// One task per process, with a database advisory lock coordinating processes.
export function startLeaseMaintenance(intervalMs = 15000) {
  let pending: Promise<void> | undefined;
  let stopped = false;
  const tick = () => {
    if (stopped || pending) return;
    pending = recoverLeases()
      .catch((error) => {
        logger.error({ err: error, component: 'maintenance' }, 'Lease maintenance failed');
      })
      .finally(() => {
        pending = undefined;
      });
  };

  tick();
  const timer = setInterval(tick, intervalMs);

  timer.unref();

  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
}
