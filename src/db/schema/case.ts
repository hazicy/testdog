import { integer, pgTable } from 'drizzle-orm/pg-core';

export const Case = pgTable('csae', {
  id: integer(),
});
