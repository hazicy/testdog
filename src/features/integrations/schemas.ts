import { z } from 'zod';

export const channelSchema = z.enum(['feishu', 'email']);
export const eventSchema = z.enum([
  'run.failed',
  'issue.created',
  'issue.status_changed',
  'verification.completed',
]);
const common = {
  version: z.number().int().nonnegative(),
  enabled: z.boolean(),
  events: z
    .array(eventSchema)
    .max(4)
    .refine((items) => new Set(items).size === items.length),
};

export const feishuWebhook = z
  .url()
  .max(1000)
  .refine((value) => {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      url.hostname === 'open.feishu.cn' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (!url.port || url.port === '443') &&
      /^\/open-apis\/bot\/v2\/hook\/[a-zA-Z0-9-]+$/.test(url.pathname)
    );
  }, '请填写飞书群机器人的 HTTPS Webhook 地址');
export const feishuInput = z
  .object({
    ...common,
    webhookUrl: feishuWebhook.optional(),
    signingSecret: z.string().trim().min(1).max(500).optional(),
    clearSigningSecret: z.boolean().optional(),
  })
  .strict();
export const emailInput = z
  .object({
    ...common,
    recipients: z.array(z.email().max(320)).min(1).max(10),
  })
  .strict();

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
export const browserlessInput = browserlessConfigSchema.partial().extend({
  version: z.number().int().min(0),
  enabled: z.boolean(),
  clearToken: z.boolean().default(false),
});
