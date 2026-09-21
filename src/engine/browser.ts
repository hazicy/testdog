import { Browser, chromium } from 'playwright';

export class BrowserClient {
  private browser: Browser;

  constructor(browser: Browser) {
    this.browser = browser;
  }

  static async create() {
    const browser = await chromium.launch({
      headless: process.env.AUTOMATION_HEADLESS === 'true',
    });
    return new BrowserClient(browser);
  }

  getBrowser() {
    return this.browser;
  }

  async newPage() {
    return await this.browser.newPage();
  }

  async close() {
    await this.browser.close();
  }
}
