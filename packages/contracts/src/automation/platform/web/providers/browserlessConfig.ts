import { z } from 'zod';

export const browserlessConfigSchema = z.strictObject({
  endpoint: z
    .string()
    .trim()
    .max(4096)
    .refine((value) => {
      try {
        const url = new URL(value);

        return (
          ['ws:', 'wss:'].includes(url.protocol) &&
          !!url.hostname &&
          !url.username &&
          !url.password &&
          !url.hash &&
          url.pathname.replace(/\/$/, '').endsWith('/chromium/playwright')
        );
      } catch {
        return false;
      }
    }, '请填写 ws 或 wss 的 /chromium/playwright 端点'),
  token: z.string().trim().min(1).max(4096).optional(),
});
export type BrowserlessConfig = z.infer<typeof browserlessConfigSchema>;
