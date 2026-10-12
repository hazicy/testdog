import { z } from 'zod';
import { WorkspaceError } from '@testdog/server/shared/errors';

const smtpConfig = z.object({
  host: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/),
  port: z.union([z.literal(465), z.literal(587)]),
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1000),
  from: z.email().max(320),
});

export const emailUnavailableMessage = '邮件通知暂不可用，请联系管理员。';

export function platformSmtpConfig() {
  const result = smtpConfig.safeParse({
    host: process.env.CASEFORGE_SMTP_HOST,
    port: Number(process.env.CASEFORGE_SMTP_PORT),
    username: process.env.CASEFORGE_SMTP_USERNAME,
    password: process.env.CASEFORGE_SMTP_PASSWORD,
    from: process.env.CASEFORGE_SMTP_FROM,
  });

  return result.success ? result.data : undefined;
}

export function requirePlatformSmtp() {
  const config = platformSmtpConfig();

  if (!config) throw new WorkspaceError(emailUnavailableMessage, 503);

  return config;
}
