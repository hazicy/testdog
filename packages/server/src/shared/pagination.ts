import { z } from 'zod';
import { WorkspaceError } from '@testdog/server/shared/errors';

const cursorSchema = z.object({ date: z.iso.datetime({ offset: true }), id: z.uuid() });

export function readPage(request: Request) {
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get('limit') ?? 50);
  const q = (params.get('q') ?? '').trim();
  const status = params.get('status') ?? 'all';

  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || q.length > 200)
    throw new WorkspaceError('分页或搜索参数无效。');
  let cursor: z.infer<typeof cursorSchema> | undefined;

  if (params.has('cursor')) {
    try {
      const value = params.get('cursor')!;

      if (value.length > 300) throw new Error();
      cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString()));
    } catch {
      throw new WorkspaceError('分页游标无效。');
    }
  }

  return { limit, q, status, cursor };
}

export type PageQuery = ReturnType<typeof readPage>;
export const pageCursor = (date: string, id: string) =>
  Buffer.from(
    JSON.stringify({ date: date.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'), id }),
  ).toString('base64url');
export const searchPattern = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;
