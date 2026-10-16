import { logger } from '@testdog/server/shared/logger';
import { z } from 'zod';
import { WorkspaceError } from '@testdog/server/shared/errors';

export function validId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new WorkspaceError('无效的记录 ID。');
}

export function apiError(error: unknown) {
  if (error instanceof WorkspaceError)
    return Response.json(
      {
        success: false,
        message: error.message,
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
      },
      { status: error.status },
    );
  logger.error({ err: error, component: 'api' }, '工作台请求失败');

  return Response.json(
    { success: false, message: '无法访问数据，请确认数据库已启动并完成迁移。' },
    { status: 503 },
  );
}
