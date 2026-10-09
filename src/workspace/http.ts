import { NextResponse } from 'next/server';
import { z } from 'zod';
import { WorkspaceError } from './store';
export function validId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new WorkspaceError('无效的记录 ID。');
}
export function apiError(error: unknown) {
  if (error instanceof WorkspaceError)
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  console.error('工作台请求失败', error instanceof Error ? error.message : error);
  return NextResponse.json(
    { success: false, message: '无法访问数据，请确认数据库已启动并完成迁移。' },
    { status: 503 },
  );
}
