import { pgTable, text, timestamp, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const authUsers = pgTable('auth_users', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    userId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    expiresAt: timestamp().notNull(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [index('auth_sessions_user_idx').on(table.userId)],
);

export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp(),
    refreshTokenExpiresAt: timestamp(),
    scope: text(),
    password: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index('auth_accounts_user_idx').on(table.userId),
    uniqueIndex('auth_accounts_provider_idx').on(table.providerId, table.accountId),
  ],
);

export const authVerifications = pgTable(
  'auth_verifications',
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [index('auth_verifications_identifier_idx').on(table.identifier)],
);
