import { Browser, chromium } from 'playwright';
export class Broswer {
  private browser: Browser;

  constructor() {
    this.browser = chromium.launch();
  }

  static async create() {
    return new Broswer();
  }

  async newPage() {
    return await this.browser.newPage();
  }

  async close() {
    await this.browser.close();
  }
}
