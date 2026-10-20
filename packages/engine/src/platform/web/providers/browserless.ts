import { browserlessConfigSchema } from '@testdog/contracts/automation/platform/web/providers/browserlessConfig';
import { connectBrowserless } from '@testdog/engine/platform/web/browserless';
import {
  browserConnection,
  type BrowserProvider,
} from '@testdog/engine/platform/web/providers/contracts';

export const browserlessProvider: BrowserProvider = {
  id: 'browserless',
  supportedBrowsers: ['chromium'],
  async connect(_target, config, signal) {
    const browser = await connectBrowserless(browserlessConfigSchema.parse(config), signal);

    return browserConnection(browser, 'browserless');
  },
};
