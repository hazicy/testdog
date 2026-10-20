import {
  integer,
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { testRuns } from './runs';

export const automationResources = pgTable(
  'automation_resources',
  {
    id: text().primaryKey(),
    hostId: text().notNull(),
    platform: text({ enum: ['web', 'android', 'ios'] }).notNull(),
    profileId: text().notNull(),
    deviceId: text(),
    status: text({ enum: ['available', 'busy', 'quarantined'] })
      .notNull()
      .default('available'),
    owner: text(),
    runId: uuid().references(() => testRuns.id, { onDelete: 'set null' }),
    fencingToken: integer().notNull().default(0),
    leaseUntil: timestamp({ withTimezone: true, mode: 'string' }),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    check('automation_resources_platform_check', sql`${table.platform} in ('web','android','ios')`),
    uniqueIndex('automation_resource_device_unique').on(
      table.hostId,
      table.platform,
      table.deviceId,
    ),
    check(
      'automation_resource_status_check',
      sql`${table.status} in ('available','busy','quarantined')`,
    ),
  ],
);
