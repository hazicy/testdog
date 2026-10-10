import { recoverLeases } from './scheduler';

// One task per process, with a database advisory lock coordinating processes.
export function startLeaseMaintenance(intervalMs = 15000) {
  let pending: Promise<void> | undefined;
  let stopped = false;
  const tick = () => {
    if (stopped || pending) return;
    pending = recoverLeases()
      .catch((error) => {
        console.error('Lease maintenance failed', error);
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
