import { z } from 'zod';

export const suiteInputSchema = z.strictObject({
  parentId: z.uuid().nullable().default(null),
  name: z.string().trim().min(1, '请输入文件夹名称。').max(100, '文件夹名称过长。'),
  testIds: z
    .array(z.uuid())
    .max(100, '套件最多包含 100 条用例。')
    .refine((ids) => new Set(ids).size === ids.length, '套件中不能重复添加同一用例。'),
});
export const suiteUpdateSchema = suiteInputSchema.extend({
  version: z.number().int().positive(),
  testIds: suiteInputSchema.shape.testIds.optional(),
});
