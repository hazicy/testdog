import {
  integer,
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { authUsers } from './auth';
import { teams } from './teams';

export const notificationIntegrations = pgTable(
  'notification_integrations',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => authUsers.id),
    teamId: uuid().references(() => teams.id),
    channel: text({ enum: ['feishu', 'email'] }).notNull(),
    enabled: boolean().notNull().default(false),
    events: jsonb()
      .$type<import('@testdog/contracts/integrations/types').NotificationEvent[]>()
      .notNull()
      .default([]),
    encryptedConfig: text().notNull(),
    version: integer().notNull().default(1),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'notification_integrations_ownership_check',
      sql`${table.userId} is null or ${table.teamId} is null`,
    ),
    uniqueIndex('notification_integrations_team_idx').on(table.teamId, table.channel),
    uniqueIndex('notification_integrations_owner_idx').on(table.userId, table.channel),
    uniqueIndex('notification_integrations_legacy_idx')
      .on(table.channel)
      .where(sql`${table.userId} is null and ${table.teamId} is null`),
    check('notification_integrations_channel_check', sql`${table.channel} in ('feishu','email')`),
  ],
);

export const notificationEventRecords = pgTable('notification_events', {
  id: uuid().primaryKey().defaultRandom(),
  userId: text().references(() => authUsers.id),
  teamId: uuid().references(() => teams.id),
  sourceKey: text().notNull().unique(),
  eventType: text().notNull(),
  payload: jsonb()
    .$type<import('@testdog/contracts/integrations/types').NotificationPayload>()
    .notNull(),
  createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid().primaryKey().defaultRandom(),
    integrationId: uuid()
      .notNull()
      .references(() => notificationIntegrations.id, { onDelete: 'cascade' }),
    integrationVersion: integer().notNull(),
    eventId: uuid()
      .notNull()
      .references(() => notificationEventRecords.id, { onDelete: 'cascade' }),
    status: text({ enum: ['pending', 'sending', 'sent', 'failed', 'skipped'] })
      .notNull()
      .default('pending'),
    attempts: integer().notNull().default(0),
    lastError: text(),
    leaseToken: uuid(),
    leaseUntil: timestamp({ withTimezone: true, mode: 'string' }),
    nextAttemptAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    sentAt: timestamp({ withTimezone: true, mode: 'string' }),
  },
  (table) => [
    uniqueIndex('notification_deliveries_event_idx').on(table.integrationId, table.eventId),
    index('notification_deliveries_due_idx').on(table.status, table.nextAttemptAt),
    index('notification_deliveries_event_id_idx').on(table.eventId),
    check('notification_deliveries_attempts_check', sql`${table.attempts} >= 0`),
    check(
      'notification_deliveries_status_check',
      sql`${table.status} in ('pending','sending','sent','failed','skipped')`,
    ),
  ],
);

export const browserProviderIntegrations = pgTable(
  'browser_provider_integrations',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => authUsers.id),
    teamId: uuid().references(() => teams.id),
    provider: text().notNull(),
    enabled: boolean().notNull().default(false),
    encryptedConfig: text().notNull(),
    version: integer().notNull().default(1),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'browser_provider_integrations_ownership_check',
      sql`${table.userId} is null or ${table.teamId} is null`,
    ),
    uniqueIndex('browser_provider_integrations_team_idx').on(table.teamId, table.provider),
    uniqueIndex('browser_providers_active_team_idx')
      .on(table.teamId)
      .where(sql`${table.enabled} = true`),
    uniqueIndex('browser_provider_integrations_owner_idx').on(table.userId, table.provider),
    uniqueIndex('browser_provider_integrations_active_owner_idx')
      .on(table.userId)
      .where(sql`${table.enabled} = true`),
    uniqueIndex('browser_provider_integrations_active_legacy_idx')
      .on(sql`(1)`)
      .where(sql`${table.userId} is null and ${table.teamId} is null and ${table.enabled} = true`),
    uniqueIndex('browser_provider_integrations_legacy_idx')
      .on(table.provider)
      .where(sql`${table.userId} is null and ${table.teamId} is null`),
  ],
);
