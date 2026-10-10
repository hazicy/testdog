import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { submissionRequests } from '@/db/schema';
import { WorkspaceError } from './errors';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;

  return JSON.stringify(value) ?? 'null';
}

export async function submitOnce<T extends Record<string, unknown>>(
  request: Request,
  payload: unknown,
  create: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  const key = request.headers.get('Idempotency-Key');

  if (key && !z.uuid().safeParse(key).success) throw new WorkspaceError('提交请求 ID 无效。');
  const fingerprint = createHash('sha256')
    .update(`${new URL(request.url).pathname}:${canonical(payload)}`)
    .digest('hex');

  return db.transaction(async (tx) => {
    if (!key) return create(tx);
    const inserted = await tx
      .insert(submissionRequests)
      .values({ key, fingerprint })
      .onConflictDoNothing()
      .returning();

    if (!inserted.length) {
      const [existing] = await tx
        .select()
        .from(submissionRequests)
        .where(eq(submissionRequests.key, key));

      if (existing.fingerprint !== fingerprint)
        throw new WorkspaceError('同一请求 ID 不能提交不同参数。', 409);

      return existing.response as T;
    }

    const response = await create(tx);

    await tx.update(submissionRequests).set({ response }).where(eq(submissionRequests.key, key));

    return response;
  });
}
