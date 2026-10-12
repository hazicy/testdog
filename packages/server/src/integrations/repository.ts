import { readBrowserProviders } from '@testdog/server/browser-providers/repository';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@testdog/server/db';
import {
  notificationIntegrations as integrations,
  notificationDeliveries as deliveries,
  notificationEventRecords as events,
} from '@testdog/server/db/schema';
import { ownedBy, type UserScope } from '@testdog/server/shared/ownership';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { encryptSecret, decryptSecret } from '@testdog/server/shared/secrets';
import { platformSmtpConfig, requirePlatformSmtp } from '@testdog/server/integrations/smtp';
import { emailInput, feishuInput } from '@testdog/contracts/integrations/schemas';
import type {
  EmailConfig,
  FeishuConfig,
  Integration,
  NotificationChannel,
  NotificationConfig,
} from '@testdog/contracts/integrations/types';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function integrationView(row: typeof integrations.$inferSelect): Integration {
  let config: NotificationConfig;

  try {
    config = decryptSecret(row.encryptedConfig, row.userId, row.channel) as NotificationConfig;
  } catch {
    return {
      channel: row.channel,
      version: row.version,
      enabled: row.enabled,
      events: row.events,
      configured: false,
      hasSigningSecret: false,
      configurationError:
        row.channel === 'email'
          ? '无法读取收件配置，请重新填写收件邮箱后保存。'
          : '配置无法解密，请重新填写完整配置和密钥后保存。',
    };
  }

  const email = row.channel === 'email' ? (config as EmailConfig) : undefined;

  return {
    channel: row.channel,
    enabled: row.enabled,
    events: row.events,
    version: row.version,
    configured: true,
    hasSigningSecret: row.channel === 'feishu' && !!(config as FeishuConfig).signingSecret,
    email: email ? { recipients: email.recipients } : undefined,
  };
}

async function integrationFor(
  tx: Tx | typeof db,
  channel: NotificationChannel,
  userId: UserScope,
  lock = false,
) {
  const query = tx
    .select()
    .from(integrations)
    .where(and(eq(integrations.channel, channel), ownedBy(integrations.userId, userId)));
  const [row] = await (lock ? query.for('update') : query);

  return row;
}

export async function readIntegrations(userId: UserScope) {
  const rows = await db.select().from(integrations).where(ownedBy(integrations.userId, userId));
  const history = await db
    .select({
      id: deliveries.id,
      channel: integrations.channel,
      eventType: events.eventType,
      title: sql<string>`${events.payload}->>'title'`,
      status: deliveries.status,
      attempts: deliveries.attempts,
      lastError: deliveries.lastError,
      createdAt: deliveries.createdAt,
      sentAt: deliveries.sentAt,
    })
    .from(deliveries)
    .innerJoin(integrations, eq(integrations.id, deliveries.integrationId))
    .innerJoin(events, eq(events.id, deliveries.eventId))
    .where(ownedBy(integrations.userId, userId))
    .orderBy(desc(deliveries.createdAt), desc(deliveries.id))
    .limit(50);

  return {
    integrations: (['feishu', 'email'] as const).map((channel) => {
      const row = rows.find((item) => item.channel === channel);

      return row
        ? integrationView(row)
        : {
            channel,
            version: 0,
            enabled: false,
            events: [],
            configured: false,
            hasSigningSecret: false,
          };
    }),
    deliveries: history,
    emailAvailable: !!platformSmtpConfig(),
    browserProviders: await readBrowserProviders(userId),
  };
}

export async function saveIntegration(
  channel: NotificationChannel,
  raw: unknown,
  userId: UserScope,
) {
  const parsed = channel === 'feishu' ? feishuInput.safeParse(raw) : emailInput.safeParse(raw);

  if (!parsed.success) throw new WorkspaceError('通知配置无效，请检查地址、邮箱和通知事件。');

  return db.transaction(async (tx) => {
    const row = await integrationFor(tx, channel, userId, true);
    const input = parsed.data;

    if ((row?.version ?? 0) !== input.version)
      throw new WorkspaceError('通知配置已更新，请刷新页面后重试。', 409);
    let previous: NotificationConfig | undefined;

    if (row) {
      try {
        previous = decryptSecret(row.encryptedConfig, userId, channel) as NotificationConfig;
      } catch {
        const complete = channel === 'feishu' ? !!feishuInput.parse(raw).webhookUrl : true;

        if (!complete) throw new WorkspaceError('配置无法解密，请重新填写完整配置和密钥后保存。');
      }
    }

    let config: NotificationConfig;

    if (channel === 'feishu') {
      const value = feishuInput.parse(raw);
      const old = previous as FeishuConfig | undefined;
      const webhookUrl = value.webhookUrl ?? old?.webhookUrl;

      if (!webhookUrl) throw new WorkspaceError('请填写飞书 Webhook 地址。');
      config = {
        webhookUrl,
        signingSecret: value.clearSigningSecret
          ? undefined
          : (value.signingSecret ?? old?.signingSecret),
      };
    } else {
      const value = emailInput.parse(raw);

      config = { recipients: value.recipients };
    }

    if (input.enabled && !input.events.length)
      throw new WorkspaceError('启用通知时至少选择一个事件。');
    const values = {
      enabled: input.enabled,
      events: input.events,
      version: input.version + 1,
      encryptedConfig: encryptSecret(config, userId, channel),
      updatedAt: new Date().toISOString(),
    };
    const [saved] = row
      ? await tx.update(integrations).set(values).where(eq(integrations.id, row.id)).returning()
      : await tx
          .insert(integrations)
          .values({ ...values, channel, userId })
          .onConflictDoNothing()
          .returning();

    if (!saved) throw new WorkspaceError('通知配置已更新，请刷新页面后重试。', 409);
    await tx
      .update(deliveries)
      .set({ status: 'skipped', lastError: '通知配置已修改，旧配置下的待发通知已取消。' })
      .where(and(eq(deliveries.integrationId, saved.id), eq(deliveries.status, 'pending')));

    return integrationView(saved);
  });
}

export async function queueTest(channel: NotificationChannel, userId: UserScope, tx: Tx) {
  if (channel === 'email') requirePlatformSmtp();
  const row = await integrationFor(tx, channel, userId, true);

  if (!row) throw new WorkspaceError('请先保存通知配置。');
  const [recent] = await tx
    .select({ id: deliveries.id })
    .from(deliveries)
    .innerJoin(events, eq(events.id, deliveries.eventId))
    .where(
      and(
        eq(deliveries.integrationId, row.id),
        eq(events.eventType, 'test'),
        sql`${deliveries.createdAt} > now() - interval '30 seconds'`,
      ),
    )
    .limit(1);

  if (recent) throw new WorkspaceError('测试通知已提交，请稍候再试。', 429);
  const [event] = await tx
    .insert(events)
    .values({
      userId,
      sourceKey: `test:${randomUUID()}`,
      eventType: 'test',
      payload: {
        title: '测试通知',
        body: '通知渠道已连接，您可以在集成页面选择需要接收的事件。',
        path: '/integrations',
      },
    })
    .returning();
  const [delivery] = await tx
    .insert(deliveries)
    .values({ integrationId: row.id, integrationVersion: row.version, eventId: event.id })
    .returning();

  return { deliveryId: delivery.id };
}

export async function retryDelivery(channel: NotificationChannel, id: string, userId: UserScope) {
  if (channel === 'email') requirePlatformSmtp();

  return db.transaction(async (tx) => {
    const row = await integrationFor(tx, channel, userId, true);

    if (!row) throw new WorkspaceError('通知记录不存在。', 404);
    const [delivery] = await tx
      .update(deliveries)
      .set({
        status: 'pending',
        attempts: 0,
        lastError: null,
        nextAttemptAt: new Date().toISOString(),
        leaseToken: null,
        leaseUntil: null,
        integrationVersion: row.version,
      })
      .where(
        and(
          eq(deliveries.id, id),
          eq(deliveries.integrationId, row.id),
          eq(deliveries.status, 'failed'),
        ),
      )
      .returning();

    if (!delivery) throw new WorkspaceError('只有发送失败的通知可以重试。', 409);

    return { deliveryId: id };
  });
}
