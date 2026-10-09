import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';

export const Case = pgTable('case', {
  id: integer(),
  goal: varchar(),
});

export const users = pgTable('users', {
  id: integer(),
  name: varchar(),
});
