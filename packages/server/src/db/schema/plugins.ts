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
import { authUsers } from './auth';
import { teams } from './teams';

export const pluginSettings = pgTable(
  'plugin_settings',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => authUsers.id),
    teamId: uuid().references(() => teams.id),
    pluginId: text().notNull(),
    config: jsonb().$type<Record<string, unknown>>().notNull(),
    version: integer().notNull().default(1),
    updatedAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'plugin_settings_ownership_check',
      sql`${table.userId} is null or ${table.teamId} is null`,
    ),
    uniqueIndex('plugin_settings_team_idx').on(table.teamId, table.pluginId),
    uniqueIndex('plugin_settings_owner_idx').on(table.userId, table.pluginId),
    uniqueIndex('plugin_settings_legacy_idx')
      .on(table.pluginId)
      .where(sql`${table.userId} is null and ${table.teamId} is null`),
  ],
);
