import { createHmac } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';

const smtp = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn(), createTransport: vi.fn() }));

vi.mock('nodemailer', () => ({ default: { createTransport: smtp.createTransport } }));
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => ({ address: '8.8.8.8', family: 4 })),
}));
import { sendNotification, feishuSign, publicAddress } from '@testdog/server/integrations/delivery';
import { feishuWebhook } from '@testdog/contracts/integrations/schemas';

const payload = { title: '测试失败', body: '查看结果', path: '/runs/run-id' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it('validates Feishu webhook origins and signs the documented timestamp-secret key', () => {
  expect(
    feishuWebhook.safeParse('https://open.feishu.cn/open-apis/bot/v2/hook/test-hook').success,
  ).toBe(true);
  for (const url of [
    'http://open.feishu.cn/open-apis/bot/v2/hook/test',
    'https://open.feishu.cn.evil.test/open-apis/bot/v2/hook/test',
    'https://localhost/hook',
    'https://open.feishu.cn/open-apis/bot/v2/hook/test?redirect=1',
  ])
    expect(feishuWebhook.safeParse(url).success).toBe(false);
  expect(feishuSign('secret', '1234')).toBe(
    createHmac('sha256', '1234\nsecret').update('').digest('base64'),
  );
});

it('rejects private, link-local and mapped addresses before SMTP connections', () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1',
    '0:0:0:0:0:ffff:7f00:1',
    'not-an-ip',
  ])
    expect(publicAddress(address)).toBe(false);
  expect(publicAddress('8.8.8.8')).toBe(true);
});

it('sends signed Feishu text, respects provider codes, and hides provider response secrets', async () => {
  const fetcher = vi.fn(async () => Response.json({ code: 0 }));

  vi.stubGlobal('fetch', fetcher);
  vi.stubEnv('BETTER_AUTH_URL', 'https://testdog.example.com');
  await sendNotification(
    'feishu',
    {
      webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/test-hook',
      signingSecret: 'secret',
    },
    payload,
    'delivery',
  );
  const request = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  const body = JSON.parse(request[1].body as string);

  expect(body.content.text).toContain('https://testdog.example.com/runs/run-id');
  expect(body.sign).toBe(feishuSign('secret', body.timestamp));
  fetcher.mockResolvedValue(Response.json({ code: 19021, msg: 'secret provider response' }));
  await expect(
    sendNotification('feishu', { webhookUrl: request[0] }, payload, 'delivery'),
  ).rejects.toThrow('飞书拒绝通知');
});

function configureSmtp(port = '587') {
  vi.stubEnv('CASEFORGE_SMTP_HOST', 'smtp.example.com');
  vi.stubEnv('CASEFORGE_SMTP_PORT', port);
  vi.stubEnv('CASEFORGE_SMTP_USERNAME', 'sender@example.com');
  vi.stubEnv('CASEFORGE_SMTP_PASSWORD', 'platform-secret');
  vi.stubEnv('CASEFORGE_SMTP_FROM', 'sender@example.com');
}

it.each(['465', '587'])(
  'uses platform SMTP on port %s, TLS and private BCC recipients, ignoring legacy SMTP settings',
  async (port) => {
    configureSmtp(port);
    const config = {
      host: 'legacy-smtp.example.com',
      port: 465 as const,
      username: 'old@example.com',
      password: 'old-secret',
      from: 'old@example.com',
      recipients: ['recipient@example.com'],
    };

    smtp.createTransport.mockReturnValue({ sendMail: smtp.sendMail, close: smtp.close });
    smtp.sendMail.mockResolvedValue({ accepted: config.recipients, rejected: [] });
    await sendNotification('email', config, payload, 'delivery');
    expect(smtp.createTransport.mock.calls[0][0]).toMatchObject({
      host: '8.8.8.8',
      port: Number(port),
      secure: port === '465',
      requireTLS: port === '587',
      tls: { servername: 'smtp.example.com', minVersion: 'TLSv1.2' },
      auth: { user: 'sender@example.com', pass: 'platform-secret' },
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(smtp.sendMail.mock.calls[0][0]).toMatchObject({
      from: 'sender@example.com',
      bcc: config.recipients,
      subject: '[testdog] 测试失败',
      messageId: '<delivery@testdog.invalid>',
    });
    smtp.sendMail.mockRejectedValue(Object.assign(new Error('password secret'), { code: 'EAUTH' }));
    await expect(sendNotification('email', config, payload, 'delivery')).rejects.toThrow(
      '邮件通知暂不可用，请联系管理员。',
    );
    expect(smtp.close).toHaveBeenCalledTimes(2);
  },
);

it('rejects missing or invalid platform SMTP configuration without connecting or using legacy credentials', async () => {
  const config = {
    host: 'legacy.example.com',
    port: 465 as const,
    username: 'old',
    password: 'old-secret',
    from: 'old@example.com',
    recipients: ['recipient@example.com'],
  };

  configureSmtp();
  for (const [key, value] of [
    ['CASEFORGE_SMTP_HOST', ''],
    ['CASEFORGE_SMTP_PORT', '25'],
    ['CASEFORGE_SMTP_USERNAME', ''],
    ['CASEFORGE_SMTP_PASSWORD', ''],
    ['CASEFORGE_SMTP_FROM', 'invalid'],
  ]) {
    configureSmtp();
    vi.stubEnv(key, value);
    await expect(sendNotification('email', config, payload, 'delivery')).rejects.toThrow(
      '邮件通知暂不可用',
    );
  }

  expect(smtp.createTransport).not.toHaveBeenCalled();
});

it('sanitizes delivery failures and closes the SMTP transport', async () => {
  configureSmtp();
  smtp.createTransport.mockReturnValue({ sendMail: smtp.sendMail, close: smtp.close });
  smtp.sendMail.mockRejectedValue(new Error('raw smtp password secret'));
  await expect(
    sendNotification('email', { recipients: ['recipient@example.com'] }, payload, 'delivery'),
  ).rejects.toThrow('邮件发送失败，请检查收件邮箱或稍后重试。');
  expect(smtp.close).toHaveBeenCalledOnce();
});
