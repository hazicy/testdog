import {
  integer,
  bigserial,
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
import { testRuns } from './runs';

// Durable notification outbox; published entries remain briefly for SSE catch-up.
export const realtimeOutbox = pgTable(
  'realtime_outbox',
  {
    userId: text().references(() => authUsers.id),
    teamId: uuid().references(() => teams.id),
    id: bigserial({ mode: 'number' }).primaryKey(),
    runId: uuid().references(() => testRuns.id, { onDelete: 'cascade' }),
    revision: integer(),
    kind: text().notNull(),
    data: jsonb().$type<Record<string, unknown>>().notNull(),
    summary: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    publishedAt: timestamp({ withTimezone: true, mode: 'string' }),
    claimToken: uuid(),
    claimUntil: timestamp({ withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('realtime_outbox_team_summary_idx')
      .on(table.teamId, table.id)
      .where(sql`${table.summary} = true`),
    check(
      'realtime_outbox_ownership_check',
      sql`${table.userId} is null or ${table.teamId} is null`,
    ),
    uniqueIndex('realtime_outbox_run_revision_idx').on(table.runId, table.revision),
    index('realtime_outbox_user_summary_idx')
      .on(table.userId, table.id)
      .where(sql`${table.summary} = true`),
    index('realtime_outbox_pending_idx')
      .on(table.id)
      .where(sql`${table.publishedAt} is null`),
  ],
);
