import { launchWebBrowser } from '@testdog/automation/platform/web/mobile';
import {
  browserConnection,
  type BrowserProvider,
} from '@testdog/automation/platform/web/providers/contracts';

export const localBrowserProvider: BrowserProvider = {
  id: 'local',
  supportedBrowsers: ['chromium', 'webkit'],
  async connect(target, _config, signal) {
    signal.throwIfAborted();
    const browser = await launchWebBrowser(target);

    if (signal.aborted) {
      await browser.close();
      signal.throwIfAborted();
    }

    return browserConnection(browser, 'local');
  },
};
