import messages from '../../messages/zh.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: 'zh' | 'en';
    Messages: typeof messages;
  }
}
