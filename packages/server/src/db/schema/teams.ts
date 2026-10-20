import { pgTable, uuid, text, timestamp, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { authUsers } from './auth';

// A team owns exactly one shared workspace. Personal ownership remains unchanged.
export const teams = pgTable('teams', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
});

export const teamMembers = pgTable(
  'team_members',
  {
    id: uuid().primaryKey().defaultRandom(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    role: text({ enum: ['admin', 'member'] }).notNull(),
  },
  (table) => [
    uniqueIndex('team_members_team_user_idx').on(table.teamId, table.userId),
    index('team_members_user_idx').on(table.userId),
    check('team_members_role_check', sql`${table.role} in ('admin', 'member')`),
  ],
);

export const teamInvitations = pgTable(
  'team_invitations',
  {
    id: uuid().primaryKey().defaultRandom(),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
  },
  (table) => [uniqueIndex('team_invitations_team_email_idx').on(table.teamId, table.email)],
);
