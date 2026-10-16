import { afterEach, expect, it, vi } from 'vitest';
import { apiError } from '@testdog/server/shared/http';
import { WorkspaceError } from '@testdog/server/shared/errors';
import { logger } from '@testdog/server/shared/logger';

afterEach(() => vi.restoreAllMocks());

it('logs unexpected API errors without exposing their details in the response', async () => {
  const log = vi.spyOn(logger, 'error').mockImplementation(() => {});
  const error = new Error('Database unavailable');
  const response = apiError(error);

  expect(log).toHaveBeenCalledWith({ err: error, component: 'api' }, '工作台请求失败');
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    success: false,
    message: '无法访问数据，请确认数据库已启动并完成迁移。',
  });
});

it('preserves expected validation errors without reporting a service failure', async () => {
  const log = vi.spyOn(logger, 'error').mockImplementation(() => {});
  const response = apiError(new WorkspaceError('名称不能为空', 400, { name: '请输入名称' }));

  expect(log).not.toHaveBeenCalled();
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    success: false,
    message: '名称不能为空',
    fieldErrors: { name: '请输入名称' },
  });
});
