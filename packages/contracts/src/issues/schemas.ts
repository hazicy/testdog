import { z } from 'zod';

export const occurrenceInput = z.object({ runId: z.uuid(), stepId: z.uuid().optional() }).strict();
export const issueInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    severity: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
    source: occurrenceInput.optional(),
  })
  .strict();
export const issueUpdate = z
  .object({
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(200).optional(),
    severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
    status: z.enum(['open', 'in_progress', 'pending_verification', 'closed']).optional(),
    closeReason: z.enum(['fixed', 'dismissed', 'duplicate', 'unreproducible']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'version'), '请提供修改内容');
export const verificationInput = z
  .object({ occurrenceId: z.uuid(), recordingVersionId: z.uuid().optional() })
  .strict();
