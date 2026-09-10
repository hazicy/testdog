import { localBrowser, Stagehand } from '@browserbasehq/stagehand';
import { generateWithOpenAI } from './generate';

export class StagehandClient {
  client: Stagehand;

  constructor(client: Stagehand) {
    this.client = client;
  }

  static async create() {
    const browser = await localBrowser.launch({
      headless: false,
    });

    try {
      const stagehand = await Stagehand.create({
        browser,
        model: {
          generate: generateWithOpenAI,
        },
        domSettleTimeoutMs: 1000,
      });

      return new StagehandClient(stagehand);
    } catch (error) {
      console.error(error);
    }
  }

  async createPage() {
    const [page] = await this.client.browser.context.pages();

    return page;
  }

  async dispose() {
    await this.client.browser.close();
  }
}
