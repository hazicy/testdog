import { z } from 'zod';

export const suiteInputSchema = z.strictObject({
  parentId: z.uuid().nullable().default(null),
  name: z.string().trim().min(1, '请输入合集名称。').max(100, '合集名称过长。'),
  testIds: z
    .array(z.uuid())
    .max(100, '合集最多包含 100 条用例。')
    .refine((ids) => new Set(ids).size === ids.length, '合集中不能重复添加同一用例。'),
});
export const suiteUpdateSchema = suiteInputSchema.extend({
  version: z.number().int().positive(),
  testIds: suiteInputSchema.shape.testIds.optional(),
});
