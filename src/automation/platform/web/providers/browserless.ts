import { browserlessConfigSchema } from '@/features/integrations/schemas';
import { connectBrowserless } from '../browserless';
import { browserConnection, type BrowserProvider } from './contracts';

export const browserlessProvider: BrowserProvider = {
  id: 'browserless',
  supportedBrowsers: ['chromium'],
  async connect(_target, config, signal) {
    const browser = await connectBrowserless(browserlessConfigSchema.parse(config), signal);

    return browserConnection(browser, 'browserless');
  },
};
