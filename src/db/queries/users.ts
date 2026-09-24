import { eq } from 'drizzle-orm';
import { db } from '..';
import { users } from '../schema/user';

export function getUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id));
}

export function getUsers() {
  return db.select().from(users);
}
