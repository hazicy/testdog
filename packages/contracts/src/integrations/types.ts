export const notificationKinds = { feishu: '飞书群机器人', email: 'Email 邮件' };
export type NotificationChannel = keyof typeof notificationKinds;
export const notificationEvents = {
  'run.failed': '执行失败',
  'issue.created': '问题创建',
  'issue.status_changed': '问题状态变化',
  'verification.completed': '回归验证完成',
};
export type NotificationEvent = keyof typeof notificationEvents;
export type FeishuConfig = { webhookUrl: string; signingSecret?: string };
export type EmailConfig = { recipients: string[] };
export type NotificationConfig = FeishuConfig | EmailConfig;
export type Integration = {
  channel: NotificationChannel;
  version: number;
  enabled: boolean;
  events: NotificationEvent[];
  configured: boolean;
  configurationError?: string;
  hasSigningSecret: boolean;
  email?: EmailConfig;
};
export type NotificationPayload = { title: string; body: string; path: string };
export type Delivery = {
  id: string;
  channel: NotificationChannel;
  eventType: string;
  title: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
};
export type BrowserProviderIntegration = {
  provider: string;
  name: string;
  description: string;
  supportedBrowsers: ('chromium' | 'webkit')[];
  version: number;
  enabled: boolean;
  configured: boolean;
  hasCredentials: boolean;
  configurationError?: string;
};
export type IntegrationsResponse = {
  browserProviders: BrowserProviderIntegration[];
  integrations: Integration[];
  deliveries: Delivery[];
  emailAvailable: boolean;
};
export const deliveryStatuses = {
  pending: '待发送',
  sending: '发送中',
  sent: '已发送',
  failed: '发送失败',
  skipped: '已取消',
};
