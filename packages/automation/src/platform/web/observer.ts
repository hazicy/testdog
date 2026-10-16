import { Page } from 'playwright';
import type { AriaNode } from '@testdog/automation/platform/web/observationView';
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
