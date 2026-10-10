import { devices, chromium, webkit, type BrowserContextOptions } from 'playwright';
import { WebTargetSchema, type WebTarget } from './target';

export function resolveWebProfile(input: WebTarget): BrowserContextOptions {
  const target = WebTargetSchema.parse(input);
  if (target.deviceProfile === 'legacy-desktop') return { viewport: { width: 1280, height: 800 } };
  const { defaultBrowserType: _browser, ...descriptor } = devices[target.deviceProfile];

  void _browser;

  return {
    ...descriptor,
    ...(target.locale ? { locale: target.locale } : {}),
    ...(target.timezoneId ? { timezoneId: target.timezoneId } : {}),
  };
}

export function launchWebBrowser(target: WebTarget) {
  return (target.browser === 'webkit' ? webkit : chromium).launch({
    headless: process.env.AUTOMATION_HEADLESS === 'true',
  });
}
