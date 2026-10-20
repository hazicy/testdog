import { Page } from 'playwright';
import type { AriaNode } from '@testdog/engine/platform/web/observationView';
import type { ObservationRequest } from '@testdog/contracts/automation/platform/contracts';

type FocusedElement = {
  ariaRef: string | null;
  role: string | null;
  name: string | null;
  placeholder: string | null;
  value: string | null;
};

export class Observer {
  async observe(page: Page, request?: ObservationRequest) {
    await page.waitForLoadState('domcontentloaded', {
      timeout: 5000,
    });

    const tree = (await page.locator('body').ariaSnapshotJSON({
      mode: 'ai',
    })) as AriaNode[];

    // ARIA role alone cannot distinguish an editable input from a select/button combobox.
    // The snapshot does not expose editability, so read it from the exact observed DOM node.
    const annotateEditability = async (nodes: AriaNode[]): Promise<void> => {
      for (const node of nodes) {
        if (node.role === 'combobox' && node.ref) {
          node.editable = await page.locator(`aria-ref=${node.ref}`).evaluate((element) => {
            if (element instanceof HTMLInputElement)
              return (
                !element.disabled &&
                !element.readOnly &&
                ![
                  'button',
                  'checkbox',
                  'radio',
                  'file',
                  'submit',
                  'reset',
                  'hidden',
                  'image',
                  'range',
                  'color',
                ].includes(element.type)
              );
            if (element instanceof HTMLTextAreaElement)
              return !element.disabled && !element.readOnly;

            return element instanceof HTMLElement && element.isContentEditable;
          });
        }

        await annotateEditability(node.children ?? []);
      }
    };

    await annotateEditability(tree);

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

    return {
      tree,
      ...(request?.ref ? { requestedRegion: request.ref } : {}),
      page: { url: page.url(), focused },
    };
  }
}
