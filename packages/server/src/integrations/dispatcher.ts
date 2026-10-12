import type { NotificationConfig } from '@testdog/contracts/integrations/types';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import {
  notificationIntegrations as integrations,
  notificationDeliveries as deliveries,
  notificationEventRecords as events,
} from '@testdog/server/db/schema';
import { decryptSecret } from '@testdog/server/shared/secrets';
import { sendNotification } from '@testdog/server/integrations/delivery';

const MAX_ATTEMPTS = 3;

export async function dispatchNotifications(limit = 10) {
  const jobs = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(deliveries)
      .where(
        sql`(${deliveries.status} = 'pending' and ${deliveries.nextAttemptAt} <= now()) or (${deliveries.status} = 'sending' and ${deliveries.leaseUntil} < now())`,
      )
      .orderBy(asc(deliveries.nextAttemptAt))
      .limit(limit)
      .for('update', { skipLocked: true });
    const claimed = [];

    for (const row of rows) {
      if (row.attempts >= MAX_ATTEMPTS) {
        await tx
          .update(deliveries)
          .set({
            status: 'failed',
            lastError: '发送进程中断，已达到自动尝试上限。',
            leaseToken: null,
            leaseUntil: null,
          })
          .where(eq(deliveries.id, row.id));
        continue;
      }

      const leaseToken = randomUUID();

      await tx
        .update(deliveries)
        .set({
          status: 'sending',
          attempts: row.attempts + 1,
          leaseToken,
          leaseUntil: sql`now() + interval '2 minutes'`,
        })
        .where(eq(deliveries.id, row.id));
      claimed.push({ ...row, leaseToken, attempts: row.attempts + 1 });
    }

    return claimed;
  });

  if (!jobs.length) return;
  const contexts = await db
    .select({ id: deliveries.id, integration: integrations, event: events })
    .from(deliveries)
    .innerJoin(integrations, eq(integrations.id, deliveries.integrationId))
    .innerJoin(events, eq(events.id, deliveries.eventId))
    .where(
      inArray(
        deliveries.id,
        jobs.map((job) => job.id),
      ),
    );
  const byId = new Map(contexts.map((context) => [context.id, context]));

  await Promise.all(
    jobs.map(async (job) => {
      const { integration, event } = byId.get(job.id) ?? {};
      const where = and(eq(deliveries.id, job.id), eq(deliveries.leaseToken, job.leaseToken));

      if (
        !integration ||
        !event ||
        integration.version !== job.integrationVersion ||
        (event.eventType !== 'test' &&
          (!integration.enabled ||
            !integration.events.includes(event.eventType as (typeof integration.events)[number])))
      ) {
        await db
          .update(deliveries)
          .set({
            status: 'skipped',
            lastError: '通知已关闭或配置已变更。',
            leaseToken: null,
            leaseUntil: null,
          })
          .where(where);

        return;
      }

      try {
        const config = decryptSecret(
          integration.encryptedConfig,
          integration.userId,
          integration.channel,
        ) as NotificationConfig;

        await sendNotification(integration.channel, config, event.payload, job.id);
        await db
          .update(deliveries)
          .set({
            status: 'sent',
            sentAt: new Date().toISOString(),
            lastError: null,
            leaseToken: null,
            leaseUntil: null,
          })
          .where(where);
      } catch (error) {
        // Provider helpers produce sanitized errors; never persist raw network/SMTP errors or credentials.
        const message = error instanceof Error ? error.message : '通知发送失败。';

        await db
          .update(deliveries)
          .set({
            status: job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            lastError: message,
            nextAttemptAt: sql`now() + ${job.attempts * 60} * interval '1 second'`,
            leaseToken: null,
            leaseUntil: null,
          })
          .where(where);
      }
    }),
  );
}

export function startNotificationDispatcher(intervalMs = 2000) {
  let pending: Promise<void> | undefined;
  let stopped = false;
  const tick = () => {
    if (stopped || pending) return;
    pending = dispatchNotifications()
      .catch(() => console.error('通知发送服务暂时无法访问队列。'))
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
