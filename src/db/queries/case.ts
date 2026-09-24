import { db } from '..';
import { Case } from '../schema/case';

export async function getCases() {
  return await db.select().from(Case);
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
