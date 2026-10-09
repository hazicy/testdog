import { eq } from 'drizzle-orm';
import { db } from '.';
import { Case, users } from './schema';

export async function getCases() {
  return db.select().from(Case);
}

export async function createCase(id: number, goal: string) {
  const [createdCase] = await db
    .insert(Case)
    .values({
      id,
      goal,
    })
    .returning();

  return createdCase;
}

export function getUserById(id: number) {
  return db.select().from(users).where(eq(users.id, id));
}

export function getUsers() {
  return db.select().from(users);
}
