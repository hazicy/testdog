import { db } from '.';
import { Case } from './schema';

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
