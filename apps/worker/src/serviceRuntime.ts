import { pool } from '@testdog/server/db';
import { startNotificationDispatcher } from '@testdog/server/integrations/dispatcher';
import { startOutboxPublisher, stopOutboxPublisher } from '@testdog/server/realtime/realtime';
import { startLeaseMaintenance } from '@testdog/server/scheduling/maintenance';
import { closeRedis } from '@testdog/server/shared/redis';

const starters = {
  maintenance: startLeaseMaintenance,
  notifications: startNotificationDispatcher,
  outbox: () => {
    startOutboxPublisher();

    return stopOutboxPublisher;
  },
};

type Service = keyof typeof starters;
type Role = 'worker' | 'maintenance' | 'notifications';
const defaults: Record<Role, readonly Service[]> = {
  worker: ['maintenance', 'notifications', 'outbox'],
  maintenance: ['maintenance', 'notifications', 'outbox'],
  notifications: ['notifications'],
};

export function backgroundServices(role: Role, configured?: string): readonly Service[] {
  if (configured === undefined) return defaults[role];
  if (configured === 'none') return [];
  const services = configured.split(',').map((name) => name.trim());

  if (services.some((name) => !Object.hasOwn(starters, name)))
    throw new Error(
      'CASEFORGE_BACKGROUND_SERVICES must be none or maintenance,notifications,outbox',
    );

  return [...new Set(services)] as Service[];
}

/** Stop producers and drain work before closing shared Redis and database connections. */
export async function runServiceProcess(
  role: Role,
  work?: (context: { signal: AbortSignal; stop: () => void }) => Promise<void>,
) {
  const services = backgroundServices(role, process.env.CASEFORGE_BACKGROUND_SERVICES);
  const controller = new AbortController();
  const stop = () => controller.abort();
  const stopped = new Promise<void>((resolve) =>
    controller.signal.addEventListener('abort', () => resolve(), { once: true }),
  );
  const keepAlive = setInterval(() => {}, 60000);
  const stops: (() => void | Promise<void>)[] = [];
  const errors: unknown[] = [];

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    for (const service of services) stops.push(starters[service]());
    process.stdout.write(`${role}: background services ${services.join(',') || 'none'}\n`);
    if (work) await work({ signal: controller.signal, stop });
    else await stopped;
  } catch (error) {
    errors.push(error);
  } finally {
    stop();
    // Invoke all stops immediately, so none can enqueue more work while another drains.
    const results = await Promise.allSettled(stops.map(async (finish) => finish()));

    for (const result of results) if (result.status === 'rejected') errors.push(result.reason);
    for (const close of [closeRedis, () => pool.end()]) {
      try {
        await close();
      } catch (error) {
        errors.push(error);
      }
    }

    clearInterval(keepAlive);
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }

  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new AggregateError(errors, `${role} failed`);
}
