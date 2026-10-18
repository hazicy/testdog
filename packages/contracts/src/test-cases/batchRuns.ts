import { z } from 'zod';

export const caseBatchRequestSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('selected'), testIds: z.array(z.uuid()).min(1) }),
  z.object({
    mode: z.literal('filtered'),
    q: z.string().trim().max(200).default(''),
    status: z
      .enum([
        'all',
        'none',
        'queued',
        'preparing',
        'running',
        'finalizing',
        'passed',
        'failed',
        'cancelled',
      ])
      .default('all'),
    folderId: z.uuid().optional(),
  }),
]);
export type CaseBatchRequest = z.infer<typeof caseBatchRequestSchema>;
