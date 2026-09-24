import { db } from '..';
import { Case } from '../schema/case';

export async function getCases() {
  return await db.select().from(Case);
}
