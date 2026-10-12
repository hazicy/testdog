import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP, BlockList } from 'node:net';
import nodemailer from 'nodemailer';
import { requirePlatformSmtp, emailUnavailableMessage } from '@testdog/server/integrations/smtp';
import { feishuWebhook } from '@testdog/contracts/integrations/schemas';
import type {
  EmailConfig,
  FeishuConfig,
  NotificationChannel,
  NotificationConfig,
  NotificationPayload,
} from '@testdog/contracts/integrations/types';

const blocked = new BlockList();

for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
] as const)
  blocked.addSubnet(address, prefix, 'ipv6');

export function publicAddress(address: string) {
  const family = isIP(address);

  if (!family) return false;
  if (family === 6 && new URL(`http://[${address}]/`).hostname.startsWith('[::ffff:')) return false;

  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

export function feishuSign(secret: string, timestamp: string) {
  return createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64');
}

function messageText(payload: NotificationPayload) {
  const origin = process.env.BETTER_AUTH_URL;
  const url = origin ? new URL(payload.path, origin).toString() : payload.path;

  return `[testdog] ${payload.title}\n${payload.body}\n${url}`;
}

export async function sendNotification(
  channel: NotificationChannel,
  config: NotificationConfig,
  payload: NotificationPayload,
  deliveryId: string,
) {
  if (channel === 'feishu') {
    const value = config as FeishuConfig;

    if (!feishuWebhook.safeParse(value.webhookUrl).success)
      throw new Error('飞书 Webhook 地址无效。');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    let response: Response;

    try {
      response = await fetch(value.webhookUrl, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content: { text: messageText(payload) },
          ...(value.signingSecret
            ? { timestamp, sign: feishuSign(value.signingSecret, timestamp) }
            : {}),
        }),
      });
    } catch {
      throw new Error('飞书连接失败或超时，请检查网络和 Webhook 配置。');
    }

    const body = await response.json().catch(() => null);

    if (!response.ok || !body || (body.code ?? body.StatusCode) !== 0)
      throw new Error('飞书拒绝通知，请检查机器人签名、关键词和访问限制。');

    return;
  }

  const recipients = (config as EmailConfig).recipients;
  const value = requirePlatformSmtp();
  let address: string;
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;

  try {
    const resolved = await Promise.race([
      lookup(value.host),
      new Promise<never>((_, reject) => {
        dnsTimer = setTimeout(() => reject(new Error('DNS_TIMEOUT')), 5000);
      }),
    ]);

    address = resolved.address;
  } catch {
    throw new Error(emailUnavailableMessage);
  } finally {
    clearTimeout(dnsTimer);
  }

  if (!publicAddress(address) && process.env.CASEFORGE_ALLOW_PRIVATE_SMTP !== 'true')
    throw new Error(emailUnavailableMessage);
  const transport = nodemailer.createTransport({
    host: address,
    port: value.port,
    secure: value.port === 465,
    requireTLS: value.port === 587,
    tls: { servername: value.host, minVersion: 'TLSv1.2' },
    auth: { user: value.username, pass: value.password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });

  let sendTimer: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      transport.sendMail({
        from: value.from,
        bcc: recipients,
        subject: `[testdog] ${payload.title}`,
        text: messageText(payload),
        messageId: `<${deliveryId}@testdog.invalid>`,
      }),
      new Promise<never>((_, reject) => {
        sendTimer = setTimeout(() => {
          transport.close();
          reject(new Error('SMTP_TIMEOUT'));
        }, 30000);
      }),
    ]);

    if (result.rejected?.length || result.accepted?.length !== recipients.length)
      throw new Error('SMTP_RECIPIENT_REJECTED');
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;

    throw new Error(
      code === 'EAUTH' ? emailUnavailableMessage : '邮件发送失败，请检查收件邮箱或稍后重试。',
    );
  } finally {
    clearTimeout(sendTimer);
    transport.close();
  }
}
