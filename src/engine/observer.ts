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

type FocusedElement = {
  ariaRef: string | null;
  role: string | null;
  name: string | null;
  placeholder: string | null;
  value: string | null;
};

export class Observer {
  constructor() {}

  async observe(page: Page) {
    const tree = (await page.locator('body').ariaSnapshotJSON({
      mode: 'ai',
    })) as AriaTree;

    const focused = await page.evaluate((): FocusedElement | null => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body) return null;

      const isPassword = active instanceof HTMLInputElement && active.type === 'password';
      const value =
        (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && !isPassword
          ? active.value
          : null;

      return {
        ariaRef: active.getAttribute('aria-ref'),
        role: active.getAttribute('role'),
        name: active.getAttribute('aria-label') ?? active.getAttribute('name'),
        placeholder: active.getAttribute('placeholder'),
        // Password values are deliberately not included in model context.
        value,
      };
    });

    return { tree, page: { url: page.url(), focused } };
  }
}
