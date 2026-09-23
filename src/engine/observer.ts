import { Page } from 'playwright';

type AriaNode = {
  role: string;
  name?: string;
  text?: string;
  ref?: string;
  children?: AriaNode[];
  [key: string]: unknown;
};

type AriaTree = Record<string, AriaNode[]>;

export class Observer {
  constructor() {}

  async observe(page: Page) {
    const tree = (await page.locator('body').ariaSnapshotJSON({
      mode: 'ai',
    })) as AriaTree;

    return { tree };
  }
}
