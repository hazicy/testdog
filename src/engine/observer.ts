import { Page } from 'playwright';

type AriaNode = {
  role: string;
  name?: string;
  text?: string;
  ref?: string;
  children?: AriaNode[];
  [key: string]: unknown;
};

export class Observer {
  constructor() {}

  async observe(page: Page) {
    const tree = (await page.locator('body').ariaSnapshotJSON({
      mode: 'ai',
    })) as AriaNode[];

    const rawTree = await page.locator('body').ariaSnapshot({
      mode: 'ai',
    });

    console.dir(tree, { depth: null, colors: true });

    return { tree, rawTree };
  }

  transformToJev(tree: AriaNode[]) {
    return tree;
  }
}
